/**
 * True inside non-interactive miniature previews (the app switcher). Heavy
 * embeds - a WebView-backed Google Maps frame per card - are wasteful and
 * invisible at 0.5 scale, so component implementations swap in lightweight
 * placeholders when this is set.
 */
import { createContext } from "react";

export const RenderPreviewContext = createContext(false);
