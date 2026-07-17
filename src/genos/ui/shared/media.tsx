/**
 * Semantic image element shared by all design systems: resolves /api/img
 * queries via useSemanticImage, fades in on load, and shows a themed
 * placeholder while unresolved. Follows the createMapRenderer pattern -
 * design systems supply only their placeholder color. The contract's alt
 * text rides along as the accessibility label (including on the
 * placeholder, so screen readers aren't blind while an image resolves).
 */
import React, { useState } from "react";
import { Image, View } from "react-native";
import { useSemanticImage } from "../../tools/images";

export function createImg(usePlaceholderColor: () => string) {
  return function Img({ uri, alt, style }: { uri?: string; alt?: string; style: object }) {
    const placeholder = usePlaceholderColor();
    const [loaded, setLoaded] = useState(false);
    const resolved = useSemanticImage(uri);
    const a11y = alt
      ? ({ accessible: true, accessibilityRole: "image", accessibilityLabel: alt } as const)
      : undefined;
    if (!resolved) return <View style={[style, { backgroundColor: placeholder }]} {...a11y} />;
    return (
      <Image
        source={{ uri: resolved }}
        onLoad={() => setLoaded(true)}
        style={[style, { opacity: loaded ? 1 : 0 }]}
        resizeMode="cover"
        {...a11y}
      />
    );
  };
}
