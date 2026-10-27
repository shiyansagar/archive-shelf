// Placeholder archive. Every image is a random (but stable) photo from picsum.photos,
// picked by a seed, so the same project always shows the same pictures.

const LIST = [
  // title,                 discipline,     year, location,      collaborator
  ['Studio & Info',          'Studio',       2026, 'Everywhere',  'Independent'],
  ['Tidal Chair',            'Furniture',    2025, 'Lisbon',      'Atelier Maré'],
  ['Meridian Lamp',          'Lighting',     2024, 'Copenhagen',  'North Works'],
  ['Kasa Pavilion',          'Architecture', 2023, 'Kyoto',       'Hoshino Group'],
  ['Halden House',           'Architecture', 2022, 'Oslo',        'Private client'],
  ['Orbit Speaker',          'Product',      2025, 'Berlin',      'Klang Audio'],
  ['Field Notes',            'Photography',  2021, 'Patagonia',   'Self-initiated'],
  ['Salt & Stone',           'Interior',     2024, 'Marseille',   'Maison Sel'],
  ['Northern Light',         'Photography',  2020, 'Tromsø',      'Self-initiated'],
  ['Atlas Stool',            'Furniture',    2023, 'Milan',       'Fratelli Bossi'],
  ['Monolith Vase',          'Object',       2022, 'Seoul',       'Onggi Lab'],
  ['Quiet Harbour',          'Photography',  2019, 'Hokkaido',    'Self-initiated'],
  ['Lumen Table',            'Furniture',    2025, 'Rotterdam',   'Studio Vaag'],
  ['Drift Bench',            'Furniture',    2021, 'Vancouver',   'Coastline Parks'],
  ['Cinder Kettle',          'Product',      2024, 'Osaka',       'Kanaya'],
  ['Arc Bookshelf',          'Furniture',    2022, 'Antwerp',     'Linde Editions'],
  ['Vela Sailboat',          'Industrial',   2026, 'Auckland',    'Southern Yachts'],
  ['Hollow Bowl',            'Object',       2020, 'Mexico City', 'Taller Barro'],
  ['Mira Camera',            'Product',      2023, 'Tokyo',       'Mira Optics'],
  ['Terra Tiles',            'Material',     2024, 'Porto',       'Cerâmica Viva'],
  ['Pale Hours',             'Photography',  2022, 'Iceland',     'Self-initiated'],
  ['Solstice Clock',         'Object',       2025, 'Zürich',      'Horlogerie Fünf'],
  ['Echo Headphones',        'Product',      2021, 'Stockholm',   'Echo Sound'],
  ['Linen Study',            'Textile',      2023, 'Belfast',     'Ulster Weavers'],
  ['Grain Restaurant',       'Interior',     2024, 'Melbourne',   'Grain Hospitality'],
  ['Helix Stair',            'Architecture', 2022, 'Barcelona',   'Casa Ribes'],
  ['Nomad Tent',             'Industrial',   2020, 'Atacama',     'Wayfarer Co.'],
  ['Pebble Mouse',           'Product',      2026, 'Taipei',      'Formosa Devices'],
  ['Aura Pitcher',           'Object',       2021, 'Helsinki',    'Saari Glass'],
  ['Summit Rover',           'Industrial',   2025, 'Houston',     'Ridgeline Labs'],
];

// Short write-ups, picked by discipline so the copy at least matches the label.
const COPY = {
  Studio: 'An independent archive of objects, rooms and images. This index is a working sketch — every tile is a placeholder pulled at random from the internet, standing in for real work until it arrives.',
  Furniture: 'A study in weight and restraint. The piece is pared back to the joints that hold it together, so the structure reads at a glance and the material is left to do the rest.',
  Lighting: 'A lamp built around a single gesture of light. The shade is tuned to wash a wall rather than a table, turning a corner of the room into the brightest thing in it.',
  Architecture: 'A building that sits low and lets the landscape lead. Rooms open in sequence, each framing one view, with thick walls that keep the light soft and the noise out.',
  Product: 'An everyday device stripped of everything it does not need. Controls are reduced to what the hand finds without looking, and the body is machined from one block.',
  Photography: 'A slow series made over several seasons in the same place. The frames favour weather over subject — fog, low sun, the short blue hour — and leave most of the picture empty.',
  Interior: 'A room shaped around how people actually move through it. Materials are local and honest, the lighting is low and warm, and every surface is meant to age in public.',
  Object: 'A small object made to be handled every day. The form comes from the making process itself, and each piece carries the slight differences of being made by hand.',
  Industrial: 'An engineered machine treated as a piece of design. The working parts stay visible, the shell is kept to the minimum needed, and maintenance is part of the form.',
  Material: 'A material study that became a product. Hundreds of test pieces were fired, broken and measured before settling on a surface that holds colour and catches raking light.',
  Textile: 'A woven study in texture and repetition. A tight weave on one side gives way to a loose open structure on the other, so the same cloth reads differently in each light.',
};

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const picsum = (seed, w, h) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

// Extra images on each project page: [width, height] for a little rhythm.
const GALLERY_SIZES = [
  [1600, 1000],
  [1000, 1250],
  [1000, 1250],
  [1600, 900],
];

export const PROJECTS = LIST.map(([title, discipline, year, location, client], i) => {
  const slug = slugify(title);
  const seed = `arc-${slug}`;
  return {
    i,
    slug,
    title,
    discipline,
    year,
    location,
    client,
    studio: i === 0, // tile 0 is the black "studio" tile, like on essesi
    text: COPY[discipline] || COPY.Object,
    thumb: picsum(seed, 640, 640), // grid texture (square)
    hero: picsum(seed, 1400, 1400), // same photo, bigger, so the flight lines up
    images: GALLERY_SIZES.map(([w, h], k) => ({ src: picsum(`${seed}-${k + 1}`, w, h), w, h })),
  };
});
