import React, {useState} from 'react';
import {View, StyleSheet, ViewStyle, LayoutChangeEvent} from 'react-native';
import {theme} from '../theme';

/**
 * The transparency grid. It measures itself rather than drawing a fixed number of
 * cells, so the same component works behind a 56px thumbnail and a full canvas.
 *
 * Both layers are absolutely positioned: the grid is only ever a backdrop, and the
 * content sits on top of it. Leaving either one in normal flow stacks them
 * vertically instead, which silently halves the preview and hides the cut-out.
 */
export function Checkerboard({size = 12, style, children}: {
  size?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const [box, setBox] = useState({width: 0, height: 0});

  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    if (width !== box.width || height !== box.height) {
      setBox({width, height});
    }
  };

  const cols = Math.ceil(box.width / size);
  const rows = Math.ceil(box.height / size);
  const cells = cols * rows;

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout}>
      <View style={[styles.grid, {width: cols * size}]} pointerEvents="none">
        {Array.from({length: cells}).map((_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          return (
            <View
              key={i}
              style={{
                width: size,
                height: size,
                backgroundColor:
                  (row + col) % 2 === 0 ? theme.color.checkerA : theme.color.checkerB,
              }}
            />
          );
        })}
      </View>
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {overflow: 'hidden', borderRadius: theme.radius.md},
  grid: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap'},
  content: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'},
});
