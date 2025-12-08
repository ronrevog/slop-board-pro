
export const CINEMATOGRAPHERS = [
  // Modern Masters
  "Roger Deakins (Naturalistic, Silhouette, Clean)",
  "Greig Fraser (Textural, Moody, Soft, Dune)",
  "Emmanuel Lubezki (Wide angle, Natural Light, Long takes)",
  "Robert Richardson (High key top-light, Halation, Tarantino)",
  "Hoyte van Hoytema (IMAX, Shallow DOF, Gritty, Nolan)",
  "Bradford Young (Available light, Underexposed, Intimate)",
  "Darius Khondji (Rich blacks, High contrast, Se7en)",
  "Dean Cundey (Atmospheric, Backlight, Haze, Spielberg)",
  "Janusz Kamiński (Grainy, Streaking highlights, Overexposed)",
  "Christopher Doyle (Neon, Step-printing, Wong Kar-wai)",

  // Legends
  "Vittorio Storaro (Color theory, Opera lighting, Warm palette)",
  "Conrad Hall (Shadowless light, Diffusion, American Beauty)",
  "Gordon Willis (Prince of Darkness, Top light, Deep blacks)",
  "Robby Müller (Flat lighting, Daylight, European minimalism)",
  "Sven Nykvist (Soft light, Faces, Bergman films)",
  "Vilmos Zsigmond (Flashing technique, Smoke, Diffused)",
  "John Alcott (Kubrick films, Candlelight, Wide lenses)",

  // Contemporary
  "Harris Savides (Desaturated, Dread, Digital pioneer)",
  "Wally Pfister (IMAX, Noir shadows, Nolan films)",
  "Rodrigo Prieto (Cross-processing, Saturated, Diverse)",
  "Robert Elswit (Anamorphic, Warm amber, PTA films)",
  "Matthew Libatique (Music video style, High contrast, Handheld)",
  "Linus Sandgren (Warm vintage, 35mm Film, Musicals)",
  "Ari Wegner (Earthy, Wide lenses, Period detail)",
  "Kyung-Pyo Hong (Dreamlike, Surreal, Korean cinema)"
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
  // Panavision C-Series Anamorphic Primes (Blade Runner, Star Wars, The Lighthouse)
  "Panavision C-Series 35mm T3 (Vintage Wide, Deep Focus)",
  "Panavision C-Series 35mm T2.3 (Fast Wide, Glowing Halation)",
  "Panavision C-Series 40mm T2.8 (Wide Normal, Petzval Swirl)",
  "Panavision C-Series 50mm T2.3 (Standard, Classic Separation)",
  "Panavision C-Series 60mm T2.8 (Macro Portrait, Razor DOF)",
  "Panavision C-Series 75mm T2.5 (Portrait, Painterly Bokeh)",
  "Panavision C-Series 100mm T2.8 (Telephoto, Subject Isolation)",
  "Panavision C-Series 150mm T3.5 (Long Telephoto, Atmosphere)",
  "Panavision C-Series 180mm T2.8 (Super Telephoto, Waterfall Bokeh)",
  // Other Cinema Lenses
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

// Panavision C-Series Anamorphic lens-specific prompt modifiers for raw sensor squeeze look
export const ANAMORPHIC_LENS_PROMPTS: Record<string, string> = {
  "Panavision C-Series 35mm T3 (Vintage Wide, Deep Focus)":
    "Raw anamorphic sensor readout, 35mm T3 lens. 2x horizontal optical compression. Ultra-wide field of view squeezed into a 4:3 frame. Subjects appear 50% width / 200% height (tall and thin). Heavy barrel distortion bending vertical lines at the edges. Deep depth of field. High optical vignetting. Distinct blue horizontal flare streaks. Vintage glass texture.",

  "Panavision C-Series 35mm T2.3 (Fast Wide, Glowing Halation)":
    "35mm T2.3 anamorphic raw capture. Horizontally squeezed geometry. Wide angle. Faster aperture creates glowing halation around highlights. Strong geometric barrel distortion. Background bokeh is visible as tall, thin vertical streaks. Soft focus roll-off at the corners. Cyan-blue lens flares.",

  "Panavision C-Series 40mm T2.8 (Wide Normal, Petzval Swirl)":
    "40mm T2.8 anamorphic raw. 2x optical squeeze. Wide-normal field of view. Subjects are vertically elongated. Distortion is present but controlled. The background features swirling 'Petzval' bokeh in the corners. High contrast center, soft edges. Classic Hollywood anamorphic look.",

  "Panavision C-Series 50mm T2.3 (Standard, Classic Separation)":
    "50mm T2.3 standard anamorphic prime. Raw 2x squeezed image. Subjects look very tall and slender. Natural vertical perspective. Strong separation between subject and background. Bokeh is rendered as sharp, extremely tall vertical ellipses (needles). Rich contrast, deep shadows, and blue streak artifacts.",

  "Panavision C-Series 60mm T2.8 (Macro Portrait, Razor DOF)":
    "60mm Macro Anamorphic T2.8. Extreme close-up shot. 2x horizontal compression. Depth of field is razor thin (macro). Background is completely dissolved into abstract vertical streaks. Subject geometry is squeezed thin. Soft, dreamy optical quality, focus breathing evident. Smooth texture.",

  "Panavision C-Series 75mm T2.5 (Portrait, Painterly Bokeh)":
    "75mm Anamorphic Portrait T2.5. Raw squeezed sensor data. Subject's face appears elongated and thin (ready for desqueeze). Background elements are large and compressed close to the subject. 'Painterly' bokeh texture—large, vertical, pill-shaped blurs. Golden/Blue horizontal lens flare. Flat field (low distortion).",

  "Panavision C-Series 100mm T2.8 (Telephoto, Subject Isolation)":
    "100mm Telephoto Anamorphic T2.8. Intense 2x horizontal compression. The background is a wash of vertical colors. Subject is isolated. The squeeze makes the subject look very tall. Sharp focus, high contrast. Straight lines remain straight (no barrel distortion). Cinematic blue streak artifacts.",

  "Panavision C-Series 150mm T3.5 (Long Telephoto, Atmosphere)":
    "150mm Long Lens Anamorphic T3.5. Extreme distance shot. 2x optical squeeze. The perspective is completely flattened. Heat haze and atmospheric particles visible. The background is compressed into a wall of vertical blur. Subject appears thin. Vintage telephoto optics, low contrast.",

  "Panavision C-Series 180mm T2.8 (Super Telephoto, Waterfall Bokeh)":
    "180mm Super-Telephoto Anamorphic T2.8. Hyper-compressed geometry. The background is obliterated into a 'curtain' of vertical light streaks ('Waterfall Bokeh'). Extreme subject isolation. The 2x squeeze is uniform. Cool color temperature. The image looks like a vertical slice of a panoramic view."
};

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
  lens: LENSES[3], // Panavision C-Series 50mm T2.3 (Standard)
  lighting: "Natural / Practical",
  aspectRatio: '2.39:1' as const,
  colorGrade: "Teal and Orange",
};
