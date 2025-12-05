
export const CINEMATOGRAPHERS = [
  "Roger Deakins (Naturalistic, Silhouette)",
  "Greig Fraser (Textural, Moody, Soft)",
  "Emmanuel Lubezki (Wide angle, Natural Light, Long takes)",
  "Robert Richardson (High key top-light, Halation)",
  "Hoyte van Hoytema (IMAX, Shallow DOF, Gritty)",
  "Bradford Young (Available light, Underexposed)",
  "Darius Khondji (Rich blacks, High contrast)",
  "Dean Cundey (Atmospheric, Backlight, Haze)",
  "Janusz Kamiński (Grainy, Streaking highlights)",
  "Wong Kar-wai style (Christopher Doyle - Neon, Step-printing)"
];

export const FILM_STOCKS = [
  "Kodak Vision3 500T 5219 (Tungsten, Fine Grain)",
  "Kodak Vision3 250D 5207 (Daylight, Natural)",
  "Kodak Double-X 5222 (Classic Cinematic B&W, 'Raging Bull' look)",
  "Kodak Tri-X 400 (High Contrast, Gritty B&W)",
  "Ilford HP5 Plus (Versatile, Documentary Style B&W)",
  "Ilford FP4 Plus (Fine Grain, Sharp B&W)",
  "Fujifilm Eterna 500T (Low Contrast, Cinematic)",
  "Kodachrome 64 (Vintage, Saturated)",
  "Alexa LF Digital (Clean, High Dynamic Range)",
  "Sony Venice (Rich Colors, Dual ISO look)",
  "16mm Grain Heavy"
];

export const LENSES = [
  "Panavision C-Series Anamorphic (Blue flare, Oval bokeh)",
  "Cooke S4/i Prime (Warm, 'Cooke Look')",
  "Zeiss Master Prime (Clinical, Sharp)",
  "Angénieux Optimo Zoom (Versatile, Cinematic)",
  "Vintage Canon K-35 (Low contrast, Flaring)",
  "14mm Ultra Wide",
  "24mm Wide",
  "35mm Classic",
  "50mm Human Eye",
  "85mm Portrait",
  "100mm Macro"
];

export const LIGHTING_STYLES = [
  "Chiaroscuro (High Contrast)",
  "Rembrandt (Triangle highlight)",
  "High Key (Bright, Even)",
  "Low Key (Dark, Moody)",
  "Practical Lighting (Source visible)",
  "Neon / Cyberpunk",
  "Golden Hour (Warm, Backlit)",
  "Moonlight / Day for Night",
  "Hard Noir Shadows"
];

export const DEFAULT_PROJECT_SETTINGS = {
  cinematographer: CINEMATOGRAPHERS[1], // Greig Fraser
  filmStock: FILM_STOCKS[0],
  lens: "Panavision C-Series Anamorphic",
  lighting: "Natural / Practical",
  aspectRatio: '2.39:1' as const,
  colorGrade: "Teal and Orange",
};