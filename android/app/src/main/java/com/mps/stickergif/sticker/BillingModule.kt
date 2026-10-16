package com.mps.stickergif.sticker

import com.android.billingclient.api.*
import com.facebook.react.bridge.*

/**
 * One non-consumable product. Subscriptions lose badly in this category - people
 * pay once to make the ads go away and never think about it again.
 */
class BillingModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx), PurchasesUpdatedListener {

    companion object {
        const val PRODUCT_ID = "mps_remove_ads"
    }

    override fun getName() = "BillingModule"

    private var client: BillingClient? = null
    private var pendingPurchase: Promise? = null

    private fun connect(onReady: (BillingClient) -> Unit, onError: (String) -> Unit) {
        val existing = client
        if (existing != null && existing.isReady) {
            onReady(existing)
            return
        }
        val created = BillingClient.newBuilder(ctx)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build()
        client = created
        created.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    onReady(created)
                } else {
                    onError(result.debugMessage.ifBlank { "Play Billing is unavailable." })
                }
            }

            override fun onBillingServiceDisconnected() {
                client = null
            }
        })
    }

    /** Source of truth on every launch: never trust a local "paid" flag alone. */
    @ReactMethod
    fun isAdFree(promise: Promise) {
        connect({ billing ->
            billing.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
            ) { _, purchases ->
                val owned = purchases.any {
                    it.products.contains(PRODUCT_ID) &&
                            it.purchaseState == Purchase.PurchaseState.PURCHASED
                }
                purchases.forEach { acknowledge(billing, it) }
                promise.resolve(owned)
            }
        }, { promise.resolve(false) })
    }

    @ReactMethod
    fun getPrice(promise: Promise) {
        connect({ billing ->
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(PRODUCT_ID)
                            .setProductType(BillingClient.ProductType.INAPP)
                            .build()
                    )
                ).build()
            billing.queryProductDetailsAsync(params) { result, details ->
                val offer = details.firstOrNull()?.oneTimePurchaseOfferDetails
                if (result.responseCode != BillingClient.BillingResponseCode.OK || offer == null) {
                    promise.resolve(null)
                } else {
                    promise.resolve(offer.formattedPrice)
                }
            }
        }, { promise.resolve(null) })
    }

    @ReactMethod
    fun purchaseAdFree(promise: Promise) {
        val activity = ctx.currentActivity
            ?: return promise.reject("E_NO_ACTIVITY", "App is not in the foreground.")

        connect({ billing ->
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(PRODUCT_ID)
                            .setProductType(BillingClient.ProductType.INAPP)
                            .build()
                    )
                ).build()

            billing.queryProductDetailsAsync(params) { result, details ->
                val product = details.firstOrNull()
                if (result.responseCode != BillingClient.BillingResponseCode.OK || product == null) {
                    promise.reject("E_NO_PRODUCT", "That purchase is not available right now.")
                    return@queryProductDetailsAsync
                }
                pendingPurchase = promise
                val flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(
                        listOf(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(product)
                                .build()
                        )
                    ).build()
                billing.launchBillingFlow(activity, flow)
            }
        }, { message -> promise.reject("E_BILLING", message) })
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        val promise = pendingPurchase
        pendingPurchase = null
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases?.forEach { client?.let { c -> acknowledge(c, it) } }
                promise?.resolve(true)
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> promise?.resolve(false)
            else -> promise?.reject("E_BILLING", result.debugMessage.ifBlank { "Purchase failed." })
        }
    }

    /** Play refunds anything left unacknowledged after three days. */
    private fun acknowledge(billing: BillingClient, purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED && !purchase.isAcknowledged) {
            billing.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
            ) { }
        }
    }
}
