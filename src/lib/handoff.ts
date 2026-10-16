/**
 * Sends a result back to the sticker editor that opened a child screen.
 *
 * The child screens used to receive an onDone callback through route params. A
 * function in navigation state is not serializable, which React Navigation warns
 * about and which breaks state restoration after the process is killed. Handing
 * the result back as plain params on the editor's own route avoids both.
 */
export type EditorResult = {edited: string; bakedText?: boolean};

export function returnToEditor(navigation: any, result: EditorResult): void {
  navigation.popTo('StickerEditor', {...result, editedAt: Date.now()}, {merge: true});
}
