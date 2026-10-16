import React, {useCallback, useState} from 'react';
import {FlatList, StyleSheet, Alert} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Screen} from '../components/Screen';
import {Button} from '../components/Button';
import {EmptyState} from '../components/EmptyState';
import {FadeIn} from '../components/FadeIn';
import {PackCard} from '../components/PackCard';
import {BottomSheet, SheetAction} from '../components/BottomSheet';
import {BannerAdSlot} from '../ads/BannerAdSlot';
import {loadPacks, savePacks, newPack} from '../storage/packs';
import {Stickers} from '../native';
import {theme} from '../theme';
import {reportError} from '../lib/errors';
import {haptics} from '../lib/haptics';
import type {StickerPack} from '../types';

export function PackListScreen({navigation}: any) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [menuFor, setMenuFor] = useState<StickerPack | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPacks()
        .then(setPacks)
        .catch(e => reportError(e, 'packlist.load'));
    }, []),
  );

  const create = async () => {
    haptics.tap();
    const pack = newPack(packs.length === 0 ? 'My stickers' : `Stickers ${packs.length + 1}`);
    const next = [pack, ...packs];
    setPacks(next);
    await savePacks(next);
    navigation.navigate('PackEditor', {packId: pack.identifier});
  };

  const remove = (pack: StickerPack) =>
    Alert.alert('Delete pack?', `"${pack.name}" and its stickers will be removed from this app.`, [
      {text: 'Keep', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const next = packs.filter(p => p.identifier !== pack.identifier);
          setPacks(next);
          await savePacks(next);
          // The JSON index and the .webp files on disk have to go together,
          // otherwise deleted packs keep eating storage.
          await Stickers.deletePack(pack.identifier).catch(e => reportError(e, 'packlist.delete'));
          haptics.tap();
        },
      },
    ]);

  return (
    <Screen title="Sticker packs" subtitle={packs.length ? `${packs.length} pack${packs.length === 1 ? '' : 's'}` : undefined} footer={<BannerAdSlot />}>
      {packs.length === 0 ? (
        <EmptyState
          headline="No packs yet. A pack needs 3 stickers before WhatsApp will take it."
          action="Create a pack"
          onAction={create}
        />
      ) : (
        <FlatList
          data={packs}
          keyExtractor={p => p.identifier}
          contentContainerStyle={styles.list}
          renderItem={({item, index}) => (
            <FadeIn delay={Math.min(index, 8) * 55}>
              <PackCard
                pack={item}
                onPress={() => navigation.navigate('PackEditor', {packId: item.identifier})}
                onMore={() => setMenuFor(item)}
              />
            </FadeIn>
          )}
          ListFooterComponent={
            <Button label="Create a pack" variant="marker" onPress={create} style={styles.cta} />
          }
        />
      )}

      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        <SheetAction
          label="Open"
          onPress={() => {
            const id = menuFor?.identifier;
            setMenuFor(null);
            if (id) navigation.navigate('PackEditor', {packId: id});
          }}
        />
        <SheetAction
          label="Delete pack"
          danger
          onPress={() => {
            const pack = menuFor;
            setMenuFor(null);
            if (pack) remove(pack);
          }}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {padding: theme.space(5), gap: theme.space(3)},
  cta: {marginTop: theme.space(3)},
});
