// Prompt pool. Answers are ordered most-common -> rarest; the last entry is the "dillion" gem.
// An entry is a string, or [display, ...aliases].
window.PROMPTS = [
  {q:"Name a country in Africa", a:["Nigeria","Egypt","Kenya","South Africa","Morocco","Ethiopia","Ghana","Algeria","Tanzania","Uganda","Senegal","Tunisia","Zimbabwe","Zambia","Angola","Mali","Namibia","Botswana","Rwanda","Madagascar","Malawi","Chad","Niger","Togo","Benin","Burundi","Eritrea","Djibouti","Lesotho","Eswatini","Comoros","Seychelles",["The Gambia","gambia"],["São Tomé and Príncipe","sao tome and principe","sao tome"]]},
  {q:"Name a chemical element", a:["Oxygen","Hydrogen","Carbon","Gold","Iron","Helium","Nitrogen","Silver","Sodium","Calcium","Copper","Zinc","Neon","Lead","Mercury","Tin","Platinum","Uranium","Argon","Cobalt","Nickel","Titanium","Lithium","Sulfur","Chlorine","Iodine","Bismuth","Tungsten","Osmium","Ytterbium","Praseodymium","Dysprosium","Rhenium","Hafnium","Technetium"]},
  {q:"Name a dog breed", a:[["Labrador","labrador retriever","lab"],"Poodle","Bulldog","Beagle","Boxer","Dachshund",["Corgi","welsh corgi"],["Husky","siberian husky"],"Chihuahua","Pug","Dalmatian","Greyhound","Rottweiler","Collie","Whippet","Basenji","Vizsla","Saluki","Akita","Samoyed","Weimaraner","Pointer","Papillon","Keeshond","Otterhound","Xoloitzcuintli","Azawakh","Lagotto Romagnolo","Sloughi"]},
  {q:"Name a musical instrument", a:["Piano","Guitar","Drums","Violin","Flute","Trumpet","Saxophone","Cello","Clarinet","Harp","Trombone","Banjo","Accordion","Oboe","Tuba","Ukulele","Mandolin","Bassoon","Harmonica","Sitar","Xylophone","Theremin","Didgeridoo","Zither",["Hurdy-gurdy","hurdy gurdy"],"Glockenspiel","Ocarina","Lute","Sackbut","Serpent","Nyckelharpa","Cimbalom"]},
  {q:"Name a planet or moon", a:["Mars","Earth","Jupiter","Venus","Saturn","Mercury","Neptune","Uranus","Pluto","Moon","Europa","Titan","Io","Ganymede","Callisto","Phobos","Deimos","Enceladus","Triton","Charon","Mimas","Rhea","Iapetus","Oberon","Titania","Miranda","Ariel","Umbriel","Dione","Tethys","Hyperion","Nereid","Puck"]},
  {q:"Name a cheese", a:["Cheddar","Mozzarella","Brie","Parmesan","Swiss","Gouda","Feta","Camembert","Provolone","Gorgonzola","Havarti","Edam","Halloumi","Ricotta","Manchego","Roquefort","Emmental",["Gruyère","gruyere"],"Pecorino","Asiago","Stilton","Munster","Taleggio","Mascarpone","Jarlsberg","Raclette",["Comté","comte"],"Limburger",["Époisses","epoisses"],"Cantal","Casu Marzu"]},
  {q:"Name a Shakespeare character", a:["Hamlet","Romeo","Juliet","Macbeth","Othello","Ophelia","Iago","Puck","Prospero","Lear","Portia","Shylock","Cordelia","Falstaff","Titania","Oberon","Banquo","Mercutio","Horatio","Bottom","Malvolio","Caliban","Viola","Rosalind","Benedick","Beatrice","Polonius","Tybalt","Cressida","Timon","Autolycus","Pistol","Dogberry","Parolles"]},
  {q:"Name a fruit", a:["Apple","Banana","Orange","Strawberry","Grape","Mango","Pineapple","Peach","Pear","Cherry","Watermelon","Lemon","Kiwi","Plum","Papaya","Fig","Pomegranate","Guava","Lychee","Apricot","Persimmon","Quince","Rambutan","Durian","Jackfruit","Soursop","Mangosteen","Loquat","Salak","Cherimoya","Pitaya","Ackee","Jabuticaba","Miracle Fruit"]},
  {q:"Name a famous painter", a:["Picasso",["Da Vinci","leonardo","leonardo da vinci"],["Van Gogh","vincent van gogh","vincent"],"Monet","Rembrandt","Michelangelo",["Dalí","dali"],"Warhol","Matisse","Raphael","Munch",["Cézanne","cezanne"],"Klimt","Rubens","Vermeer","Goya","Turner","Kahlo","Pollock","Hopper","Magritte","Caravaggio","Titian","Seurat","Gauguin","Bosch","Hokusai","Chagall","Rothko","Basquiat","Remedios Varo","Hilma af Klint","Artemisia Gentileschi"]},
  {q:"Name a space mission or spacecraft", a:["Apollo","Voyager","Sputnik","Challenger","Columbia","Hubble","Curiosity","Perseverance","Mariner","Pioneer","Viking","Gemini","Mercury","Skylab","Mir","Cassini","Galileo","Juno","New Horizons","Spirit","Opportunity","Sojourner","Philae","Magellan","Rosetta","Ulysses","Dawn","Pathfinder","Tiangong","Zond 5"]},
  {q:"Name a US state capital", a:["Austin","Boston","Denver","Phoenix","Atlanta","Nashville","Sacramento","Albany","Salem","Madison","Boise","Helena","Pierre","Bismarck","Montpelier","Concord","Augusta","Juneau","Olympia","Topeka","Frankfort","Annapolis","Harrisburg","Trenton","Dover","Jefferson City","Carson City","Santa Fe","Cheyenne","Tallahassee"]},
  {q:"Name a Greek god or goddess", a:["Zeus","Athena","Apollo","Poseidon","Hades","Aphrodite","Ares","Hera","Artemis","Hermes","Dionysus","Demeter","Hephaestus","Persephone","Hestia","Eros","Nike","Pan","Hecate","Nemesis","Helios","Selene","Eos","Morpheus","Hypnos","Thanatos","Tyche","Momus","Aristaeus","Eileithyia"]}
];

// tiers by rank position within a prompt's list
window.TIERS = [
  {id:"plankton", name:"Dust",    pts:10,  glyph:"·", sq:"⬜"},
  {id:"schooler", name:"Pebble",  pts:30,  glyph:"∘", sq:"🟧"},
  {id:"rare",     name:"Boulder",  pts:70,  glyph:"◦", sq:"🟥"},
  {id:"deepcut",  name:"Crater",   pts:140, glyph:"●", sq:"🟪"},
  {id:"dillion",  name:"Dillion",  pts:300, glyph:"★", sq:"🟨"},
  {id:"miss",     name:"Lost in space", pts:0, glyph:"×", sq:"⬛"}
];

window.RANKS = [
  {min:0,    name:"Earthling"},
  {min:250,  name:"Lunar Tourist"},
  {min:500,  name:"Red Planet Rookie"},
  {min:800,  name:"Martian Settler"},
  {min:1200, name:"Olympus Mons Legend"}
];

// 16x11 pixel mascot "Dill" – a plated Martian rover critter. . = empty
window.MASCOT = {
  pal:{"o":"#2a0e08","b":"#ff7a45","d":"#b8431f","s":"#e8a07a","p":"#ffd166","w":"#fff1e0","y":"#8a2e12","k":"#2a0e08"},
  rows:[
    "................",
    "......oooo......",
    "....oosssdoo....",
    "...osdsdsdsdo...",
    "..osdsdsdsdsdoo.",
    ".osdsdsdsdsdsdbo",
    ".obbbbbbbbbbbwko",
    ".obbbbbbbbbbbbbo",
    "..oobbbbbbbbpbo.",
    "....oyoo..oyoo..",
    "....ooo...ooo..."
  ]
};

// Cartoon pixel caricature (parody easter egg) that peeks out of a crater.
window.ELON = {
  pal:{"h":"#3b2a20","s":"#f0c4a0","e":"#2a0e08","m":"#b5543a","k":"#1b1b24","w":"#fff1e0"},
  rows:[
    "....hhhhhh....",
    "...hhhhhhhh...",
    "..hhhhhhhhhh..",
    "..hsssssssssh.",
    "..ssssssssssss",
    "..sseesssseess",
    "..ssssssssssss",
    "..sssmmmmmmsss",
    "...ssssssssss.",
    "..kkkkwwkkkkkk",
    "..kkkkwwkkkkkk"
  ]
};
