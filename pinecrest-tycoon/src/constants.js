(function () {
  const PT = (window.PT = window.PT || {});

  PT.TILE_W = 64;
  PT.TILE_H = 32;
  PT.ELEV_PX = 12; // vertical pixels per elevation ledge (crisp RCT stair height)
  PT.MAP_SIZE = 72;

  PT.SEASONS = [
    { id: 'spring', name: 'Spring', months: ['Mar', 'Apr', 'May'], growthMult: 1.55, demandMult: 0.35, baseTemp: 56, icon: '🌱' },
    { id: 'summer', name: 'Summer', months: ['Jun', 'Jul', 'Aug'], growthMult: 1.35, demandMult: 0.45, baseTemp: 74, icon: '☀️' },
    { id: 'autumn', name: 'Autumn', months: ['Sep', 'Oct', 'Nov'], growthMult: 0.85, demandMult: 1.05, baseTemp: 48, icon: '🍂' },
    { id: 'winter', name: 'Winter', months: ['Dec', 'Jan', 'Feb'], growthMult: 0.45, demandMult: 2.15, baseTemp: 26, icon: '❄️' }
  ];

  // Months 0..11 starting Jan=0, ..., Nov=10, Dec=11
  PT.MONTHS = [
    { name: 'Jan', season: 3, days: 30, demand: 1.25, snowChance: 0.85, temp: 24 },
    { name: 'Feb', season: 3, days: 28, demand: 0.70, snowChance: 0.65, temp: 28 },
    { name: 'Mar', season: 0, days: 30, demand: 0.65, snowChance: 0.15, temp: 46 },
    { name: 'Apr', season: 0, days: 30, demand: 0.80, snowChance: 0.0,  temp: 56 },
    { name: 'May', season: 0, days: 30, demand: 0.90, snowChance: 0.0,  temp: 66 },
    { name: 'Jun', season: 1, days: 30, demand: 1.00, snowChance: 0.0,  temp: 74 },
    { name: 'Jul', season: 1, days: 30, demand: 1.15, snowChance: 0.0,  temp: 79 },
    { name: 'Aug', season: 1, days: 30, demand: 1.10, snowChance: 0.0,  temp: 76 },
    { name: 'Sep', season: 2, days: 30, demand: 1.20, snowChance: 0.0,  temp: 62 },
    { name: 'Oct', season: 2, days: 30, demand: 1.45, snowChance: 0.05, temp: 50 },
    { name: 'Nov', season: 2, days: 30, demand: 1.75, snowChance: 0.35, temp: 39 },
    { name: 'Dec', season: 3, days: 31, demand: 2.85, snowChance: 0.95, temp: 25 }
  ];

  PT.UNLOCK_TRACKS = [
    { id: 'winter',  name: 'Winter Christmas Trees', icon: '🌲', items: ['scotch', 'douglas', 'spruce', 'fraser', 'noble'] },
    { id: 'berries', name: 'Summer Berries',         icon: '🍓', items: ['strawberry', 'raspberry', 'blueberry', 'blackberry'] },
    { id: 'flowers', name: 'Spring & Summer Blooms', icon: '🌷', items: ['daffodil', 'tulip', 'sunflower', 'lavender'] },
    { id: 'harvest', name: 'Autumn & Orchard',       icon: '🎃', items: ['pumpkin', 'mums', 'apple', 'peach'] }
  ];

  PT.TREES = {
    // --- Winter / Holiday Evergreens ---
    scotch: {
      id: 'scotch',
      name: 'Scotch Pine',
      category: 'tree',
      track: 'winter',
      icon: '🌲',
      peakSeasons: ['winter'],
      seasonLabel: 'Winter',
      seasonGrowth: { spring: 1.55, summer: 1.35, autumn: 0.85, winter: 0.50 },
      unlockedByDefault: true,
      cost: 15,
      basePrice: 52,
      growRate: 1.35,
      appeal: 4,
      plotColor: '#91db5a',
      desc: 'Hardy starter pine that reaches Christmas harvest size fast.',
      palette: { hi: '#6ca653', mid: '#487d3c', lo: '#2b5228', out: '#183018', trunk: '#6b472b' }
    },
    douglas: {
      id: 'douglas',
      name: 'Douglas Fir',
      category: 'tree',
      track: 'winter',
      icon: '🌲',
      peakSeasons: ['winter'],
      seasonLabel: 'Winter',
      seasonGrowth: { spring: 1.55, summer: 1.35, autumn: 0.85, winter: 0.50 },
      unlockReq: { type: 'scotch', count: 6 },
      cost: 30,
      basePrice: 105,
      growRate: 1.0,
      appeal: 7,
      plotColor: '#3fc76a',
      desc: 'Classic symmetrical Christmas tree with lush needles.',
      palette: { hi: '#549657', mid: '#326f3c', lo: '#1d4726', out: '#102916', trunk: '#5c3c24' }
    },
    spruce: {
      id: 'spruce',
      name: 'Blue Spruce',
      category: 'tree',
      track: 'winter',
      icon: '🌲',
      peakSeasons: ['winter'],
      seasonLabel: 'Winter',
      seasonGrowth: { spring: 1.55, summer: 1.35, autumn: 0.85, winter: 0.50 },
      unlockReq: { type: 'douglas', count: 8 },
      cost: 50,
      basePrice: 175,
      growRate: 0.78,
      appeal: 11,
      plotColor: '#5ec9eb',
      desc: 'Prized silvery-blue evergreen that fetches premium winter prices.',
      palette: { hi: '#78b0b8', mid: '#4a808a', lo: '#2a515c', out: '#183038', trunk: '#593d29' }
    },
    fraser: {
      id: 'fraser',
      name: 'Fraser Fir',
      category: 'tree',
      track: 'winter',
      icon: '🎄',
      peakSeasons: ['winter'],
      seasonLabel: 'Winter',
      seasonGrowth: { spring: 1.55, summer: 1.35, autumn: 0.85, winter: 0.50 },
      unlockReq: { type: 'spruce', count: 10 },
      cost: 75,
      basePrice: 270,
      growRate: 0.68,
      appeal: 15,
      plotColor: '#4be3b5',
      desc: 'Fragrant, royal silhouette—a holiday showstopper!',
      palette: { hi: '#5ea373', mid: '#316e4c', lo: '#1b4530', out: '#0e291c', trunk: '#52341e' }
    },
    noble: {
      id: 'noble',
      name: 'Snowy Noble Fir',
      category: 'tree',
      track: 'winter',
      icon: '🎄',
      peakSeasons: ['winter'],
      seasonLabel: 'Winter',
      seasonGrowth: { spring: 1.55, summer: 1.35, autumn: 0.85, winter: 0.50 },
      unlockReq: { type: 'fraser', count: 12 },
      cost: 110,
      basePrice: 410,
      growRate: 0.56,
      appeal: 22,
      plotColor: '#f2cc5a',
      desc: 'Majestic heirloom fir with huge holiday profit and prestige.',
      palette: { hi: '#82bf9a', mid: '#468262', lo: '#25523b', out: '#142e21', trunk: '#4a2e1a' }
    },

    // --- Spring & Summer Flowers ---
    daffodil: {
      id: 'daffodil',
      name: 'Spring Daffodils',
      category: 'crop',
      track: 'flowers',
      icon: '🌼',
      peakSeasons: ['spring'],
      seasonLabel: 'Spring',
      seasonGrowth: { spring: 1.90, summer: 0.85, autumn: 0.45, winter: 0.18 },
      unlockedByDefault: true,
      cost: 10,
      basePrice: 40,
      growRate: 1.75,
      appeal: 7,
      plotColor: '#f5e050',
      desc: 'Sunny yellow starter blooms that brighten early Spring fields fast.',
      palette: { hi: '#74b84b', mid: '#4b8a34', lo: '#2d5c20', out: '#1a3813', trunk: '#63442a' }
    },
    tulip: {
      id: 'tulip',
      name: 'Spring Tulips',
      category: 'crop',
      track: 'flowers',
      icon: '🌷',
      peakSeasons: ['spring'],
      seasonLabel: 'Spring',
      seasonGrowth: { spring: 1.85, summer: 0.90, autumn: 0.45, winter: 0.18 },
      unlockReq: { type: 'daffodil', count: 5 },
      cost: 15,
      basePrice: 56,
      growRate: 1.60,
      appeal: 10,
      plotColor: '#f2729d',
      desc: 'Vibrant multicolored u-pick tulip festival patch!',
      palette: { hi: '#6cb34f', mid: '#458734', lo: '#2b5922', out: '#1b3816', trunk: '#63442a' }
    },
    sunflower: {
      id: 'sunflower',
      name: 'Golden Sunflowers',
      category: 'crop',
      track: 'flowers',
      icon: '🌻',
      peakSeasons: ['summer'],
      seasonLabel: 'Summer',
      seasonGrowth: { spring: 1.25, summer: 1.75, autumn: 0.65, winter: 0.15 },
      unlockReq: { type: 'tulip', count: 6 },
      cost: 22,
      basePrice: 80,
      growRate: 1.35,
      appeal: 14,
      plotColor: '#f5c73d',
      desc: 'Towering sunny blooms that dazzle Summer guests and lift Farm Appeal.',
      palette: { hi: '#68a845', mid: '#447d2d', lo: '#2b541c', out: '#1a3611', trunk: '#4e7d2e' }
    },
    lavender: {
      id: 'lavender',
      name: 'Fragrant Lavender',
      category: 'crop',
      track: 'flowers',
      icon: '💜',
      peakSeasons: ['spring', 'summer'],
      seasonLabel: 'Spring & Sum',
      seasonGrowth: { spring: 1.55, summer: 1.65, autumn: 0.60, winter: 0.18 },
      unlockReq: { type: 'sunflower', count: 8 },
      regrowTo: 45,
      cost: 30,
      basePrice: 112,
      growRate: 1.25,
      appeal: 18,
      plotColor: '#a675e8',
      desc: 'Aromatic purple lavender rows that regrow blooms and enchant visitors!',
      palette: { hi: '#7fa86f', mid: '#567d4f', lo: '#365435', out: '#203620', trunk: '#5e442c' }
    },

    // --- Summer Berries ---
    strawberry: {
      id: 'strawberry',
      name: 'Sweet Strawberries',
      category: 'crop',
      track: 'berries',
      icon: '🍓',
      peakSeasons: ['summer', 'spring'],
      seasonLabel: 'Summer',
      seasonGrowth: { spring: 1.35, summer: 1.75, autumn: 0.55, winter: 0.15 },
      unlockedByDefault: true,
      cost: 16,
      basePrice: 60,
      growRate: 1.5,
      appeal: 10,
      plotColor: '#e84855',
      desc: 'Juicy starter u-pick berry patch—a huge favorite for Summer families!',
      palette: { hi: '#5da646', mid: '#3a7a2c', lo: '#23521b', out: '#153311', trunk: '#63442a' }
    },
    raspberry: {
      id: 'raspberry',
      name: 'Red Raspberries',
      category: 'crop',
      track: 'berries',
      icon: '🍒',
      peakSeasons: ['summer'],
      seasonLabel: 'Summer',
      seasonGrowth: { spring: 1.30, summer: 1.75, autumn: 0.65, winter: 0.18 },
      unlockReq: { type: 'strawberry', count: 5 },
      regrowTo: 45,
      cost: 22,
      basePrice: 76,
      growRate: 1.35,
      appeal: 11,
      plotColor: '#d93b6b',
      desc: 'Sweet ruby-red raspberry canes that keep regrowing summer berries!',
      palette: { hi: '#64a34e', mid: '#3e7832', lo: '#265220', out: '#163313', trunk: '#5c4128' }
    },
    blueberry: {
      id: 'blueberry',
      name: 'Orchard Blueberries',
      category: 'crop',
      track: 'berries',
      icon: '🫐',
      peakSeasons: ['summer'],
      seasonLabel: 'Summer',
      seasonGrowth: { spring: 1.30, summer: 1.75, autumn: 0.70, winter: 0.18 },
      unlockReq: { type: 'raspberry', count: 7 },
      regrowTo: 45,
      cost: 28,
      basePrice: 92,
      growRate: 1.25,
      appeal: 13,
      plotColor: '#4e7be8',
      desc: 'Lush u-pick blueberry bushes—a mid-Summer orchard favorite that regrows berries!',
      palette: { hi: '#5a9c52', mid: '#38703b', lo: '#214a27', out: '#132e18', trunk: '#5c4128' }
    },
    blackberry: {
      id: 'blackberry',
      name: 'Wild Blackberries',
      category: 'crop',
      track: 'berries',
      icon: '🍇',
      peakSeasons: ['summer', 'autumn'],
      seasonLabel: 'Sum & Fall',
      seasonGrowth: { spring: 1.15, summer: 1.65, autumn: 1.35, winter: 0.18 },
      unlockReq: { type: 'blueberry', count: 9 },
      regrowTo: 45,
      cost: 36,
      basePrice: 120,
      growRate: 1.15,
      appeal: 15,
      plotColor: '#6f42b8',
      desc: 'Rich late-Summer & Fall blackberry brambles prized for jam & cider!',
      palette: { hi: '#4e8a45', mid: '#31612e', lo: '#1d401e', out: '#112913', trunk: '#4a3220' }
    },

    // --- Autumn & Orchard Harvest ---
    pumpkin: {
      id: 'pumpkin',
      name: 'Harvest Pumpkins',
      category: 'crop',
      track: 'harvest',
      icon: '🎃',
      peakSeasons: ['autumn'],
      seasonLabel: 'Autumn',
      seasonGrowth: { spring: 0.70, summer: 1.35, autumn: 1.75, winter: 0.15 },
      unlockedByDefault: true,
      cost: 22,
      basePrice: 88,
      growRate: 1.3,
      appeal: 12,
      plotColor: '#eb8328',
      desc: 'Plump orange pumpkins on curling vines—a must-have for Autumn crowds!',
      palette: { hi: '#5ea142', mid: '#3d782b', lo: '#254f1a', out: '#163010', trunk: '#63442a' }
    },
    mums: {
      id: 'mums',
      name: 'Autumn Mums',
      category: 'crop',
      track: 'harvest',
      icon: '💐',
      peakSeasons: ['autumn'],
      seasonLabel: 'Autumn',
      seasonGrowth: { spring: 0.85, summer: 1.30, autumn: 1.80, winter: 0.15 },
      unlockReq: { type: 'pumpkin', count: 5 },
      cost: 26,
      basePrice: 100,
      growRate: 1.35,
      appeal: 15,
      plotColor: '#e05a2b',
      desc: 'Vibrant copper, gold, and burgundy chrysanthemum mounds for Fall porches!',
      palette: { hi: '#5e9640', mid: '#3b6b28', lo: '#234719', out: '#142b0f', trunk: '#63442a' }
    },
    apple: {
      id: 'apple',
      name: 'Honeycrisp Apple Tree',
      category: 'orchard',
      track: 'harvest',
      icon: '🍎',
      peakSeasons: ['summer', 'autumn'],
      seasonLabel: 'Sum & Fall',
      seasonGrowth: { spring: 1.45, summer: 1.55, autumn: 1.20, winter: 0.25 },
      unlockReq: { type: 'mums', count: 7 },
      regrowTo: 42,
      cost: 42,
      basePrice: 145,
      growRate: 0.95,
      appeal: 17,
      plotColor: '#d9483b',
      desc: 'Orchard tree bearing crisp apples in Summer & Fall—regrows fruit after picking!',
      palette: { hi: '#68a84b', mid: '#417d31', lo: '#27541e', out: '#153010', trunk: '#694426' }
    },
    peach: {
      id: 'peach',
      name: 'Orchard Peach Tree',
      category: 'orchard',
      track: 'harvest',
      icon: '🍑',
      peakSeasons: ['summer', 'autumn'],
      seasonLabel: 'Sum & Fall',
      seasonGrowth: { spring: 1.40, summer: 1.65, autumn: 1.05, winter: 0.22 },
      unlockReq: { type: 'apple', count: 10 },
      regrowTo: 42,
      cost: 58,
      basePrice: 205,
      growRate: 0.88,
      appeal: 21,
      plotColor: '#f59c62',
      desc: 'Heirloom orchard peach tree bursting with golden-blush fruit—regrows every season!',
      palette: { hi: '#75b352', mid: '#4b8736', lo: '#2d5c21', out: '#183612', trunk: '#6b4528' }
    }
  };

  PT.TREE_ORDER = [
    'daffodil', 'tulip', 'sunflower', 'lavender',
    'strawberry', 'raspberry', 'blueberry', 'blackberry',
    'pumpkin', 'mums', 'apple', 'peach',
    'scotch', 'douglas', 'spruce', 'fraser', 'noble'
  ];

  PT.TREE_STAGES = [
    { name: 'Seedling', minGrowth: 0,   sellable: false, priceMult: 0 },
    { name: 'Sapling',  minGrowth: 25,  sellable: false, priceMult: 0 },
    { name: 'Young',    minGrowth: 55,  sellable: true,  priceMult: 0.65 },
    { name: 'Prime',    minGrowth: 82,  sellable: true,  priceMult: 1.0 },
    { name: 'Grand',    minGrowth: 100, sellable: true,  priceMult: 1.38 }
  ];

  PT.BUILDINGS = {
    checkout: {
      id: 'checkout',
      name: 'Saw & Checkout Shed',
      cost: 180,
      upkeep: 10,
      defaultPrice: 0,
      adjustablePrice: false,
      appeal: 8,
      serviceTime: 2.2,
      role: 'checkout',
      desc: 'Guests bring picked trees here for netting, sawing & payment.'
    },
    cocoa: {
      id: 'cocoa',
      name: 'Hot Cocoa Stand',
      cost: 220,
      upkeep: 14,
      defaultPrice: 8,
      minPrice: 2,
      maxPrice: 20,
      adjustablePrice: true,
      appeal: 14,
      serviceTime: 1.8,
      role: 'drink',
      desc: 'Steaming cocoa with marshmallows—warms chilly guests fast!'
    },
    cider: {
      id: 'cider',
      name: 'Cider & Donut Shack',
      cost: 260,
      upkeep: 16,
      defaultPrice: 10,
      minPrice: 3,
      maxPrice: 24,
      adjustablePrice: true,
      appeal: 15,
      serviceTime: 2.0,
      role: 'food',
      desc: 'Fresh spiced apple cider and warm sugar donuts.'
    },
    wreath: {
      id: 'wreath',
      name: 'Wreath & Garland Barn',
      cost: 300,
      upkeep: 18,
      defaultPrice: 26,
      minPrice: 10,
      maxPrice: 55,
      adjustablePrice: true,
      appeal: 20,
      serviceTime: 2.4,
      role: 'shop',
      desc: 'Handmade evergreen wreaths and pine garlands for big side profits.'
    },
    firepit: {
      id: 'firepit',
      name: 'Crackling Fire Pit',
      cost: 120,
      upkeep: 5,
      defaultPrice: 0,
      adjustablePrice: false,
      appeal: 16,
      serviceTime: 3.0,
      role: 'warmth',
      desc: 'Free cozy warming circle so winter guests stay happy & linger.'
    },
    reindeer: {
      id: 'reindeer',
      name: 'Reindeer Pen',
      cost: 380,
      upkeep: 24,
      defaultPrice: 12,
      minPrice: 0,
      maxPrice: 30,
      adjustablePrice: true,
      appeal: 30,
      serviceTime: 3.2,
      role: 'attraction',
      desc: 'Friendly farm reindeer! Huge boost to family joy & Farm Rating.'
    },
    santa: {
      id: 'santa',
      name: "Santa's Photo Cabin",
      cost: 460,
      upkeep: 28,
      defaultPrice: 20,
      minPrice: 5,
      maxPrice: 45,
      adjustablePrice: true,
      appeal: 38,
      serviceTime: 3.6,
      role: 'attraction',
      desc: 'Premier holiday attraction—massive festive rating & ticket income!'
    }
  };

  PT.BUILDING_ORDER = ['checkout', 'cocoa', 'cider', 'wreath', 'firepit', 'reindeer', 'santa'];

  PT.TRACTOR_DEF = {
    name: 'Tractor Wagon Ride',
    cost: 350,
    upkeep: 15,
    defaultPrice: 6,
    minPrice: 0,
    maxPrice: 20,
    capacity: 6,
    waitSeconds: 4.5,
    speed: 2.45,
    appeal: 28,
    desc: 'Classic farm tractor pulling a cozy hayride wagon! Drives along paths & open ground between your stops.'
  };

  PT.BOAT_DEF = {
    name: 'Pond Boat & Skate Dock',
    cost: 280,
    upkeep: 12,
    defaultPrice: 8,
    minPrice: 0,
    maxPrice: 22,
    maxBoats: 5,
    maxSkaters: 7,
    paddleSpeed: 1.55,
    skateSpeed: 1.9,
    rideDuration: 15,
    appeal: 26,
    desc: 'Lakeside dock! Rents wooden rowboats on open water and switches to Ice Skate rentals when the pond freezes in Winter.'
  };

  PT.DECOR = {
    path_gravel: {
      id: 'path_gravel',
      kind: 'path',
      name: 'Gravel Farm Path',
      cost: 6,
      appeal: 2,
      desc: 'Classic country gravel walkway. Guests walk faster & stay tidy.'
    },
    path_boardwalk: {
      id: 'path_boardwalk',
      kind: 'path',
      name: 'Timber Boardwalk',
      cost: 14,
      appeal: 5,
      desc: 'Charming wooden planks with rustic appeal.'
    },
    path_bridge: {
      id: 'path_bridge',
      kind: 'path',
      name: 'Wooden Bridge',
      cost: 28,
      appeal: 7,
      onWater: true,
      desc: 'Sturdy timber bridge with railings—lets guests, staff, & tractors cross water!'
    },
    lantern: {
      id: 'lantern',
      kind: 'decor',
      name: 'Holiday Lantern Post',
      cost: 35,
      appeal: 10,
      desc: 'Warm glowing post with pine garland. Shines brightly in winter!'
    },
    fence: {
      id: 'fence',
      kind: 'decor',
      name: 'Split-Rail Fence',
      cost: 12,
      appeal: 4,
      desc: 'Rustic wooden farm fencing to frame groves and walkways.'
    },
    bench: {
      id: 'bench',
      kind: 'decor',
      name: 'Wooden Bench',
      cost: 25,
      appeal: 6,
      desc: 'Lets guests rest while sipping cocoa and admiring the pines.'
    },
    snowman: {
      id: 'snowman',
      kind: 'decor',
      name: 'Festive Snowman',
      cost: 45,
      appeal: 14,
      desc: 'Jolly snowman with top hat & scarf. Kids adore it!'
    },
    haybale: {
      id: 'haybale',
      kind: 'decor',
      name: 'Golden Hay Bales',
      cost: 20,
      appeal: 8,
      desc: 'Stacked country hay bales topped with a harvest pumpkin.'
    },
    scarecrow: {
      id: 'scarecrow',
      kind: 'decor',
      name: 'Harvest Scarecrow',
      cost: 38,
      appeal: 13,
      desc: 'Friendly flannel scarecrow with straw hat watching over your crops.'
    },
    flowerbox: {
      id: 'flowerbox',
      kind: 'decor',
      name: 'Spring Flower Arch',
      cost: 42,
      appeal: 15,
      desc: 'Rustic wooden garden arbor draped in blooming spring flowers.'
    },
    wagon_decor: {
      id: 'wagon_decor',
      kind: 'decor',
      name: 'Vintage Flower Cart',
      cost: 55,
      appeal: 18,
      desc: 'Nostalgic farm display wagon brimming with seasonal blooms & foliage.'
    },
    holiday_tree: {
      id: 'holiday_tree',
      kind: 'decor',
      name: 'Lit Festival Pine',
      cost: 75,
      appeal: 24,
      desc: 'Dazzling showpiece pine wrapped in warm golden lights & ornaments!'
    },
    gazebo: {
      id: 'gazebo',
      kind: 'decor',
      name: 'Country Picnic Gazebo',
      cost: 95,
      appeal: 26,
      desc: 'Charming timber pavilion with glowing string lights—huge appeal boost!'
    }
  };

  PT.DECOR_ORDER = [
    'path_gravel', 'path_boardwalk', 'path_bridge', 'lantern', 'fence', 'bench',
    'haybale', 'scarecrow', 'flowerbox', 'wagon_decor', 'snowman', 'holiday_tree', 'gazebo'
  ];

  PT.STAFF_TYPES = {
    forester: {
      id: 'forester',
      name: 'Forester',
      wage: 45,
      hireCost: 60,
      color: '#3f8a4b',
      hat: '#275930',
      desc: 'Auto-plants in Plots, tends plants (+25% value), harvests mature Management Plots, and clears stumps.'
    },
    handyman: {
      id: 'handyman',
      name: 'Handyman',
      wage: 35,
      hireCost: 45,
      color: '#4674a8',
      hat: '#2b4b70',
      desc: 'Sweeps snow & paths, boosts guest happiness along walkways.'
    },
    lumberjack: {
      id: 'lumberjack',
      name: 'Lumberjack',
      wage: 55,
      hireCost: 75,
      color: '#b83c34',
      hat: '#6e211c',
      desc: 'Speeds up tree cutting and Checkout Shed service!'
    },
    dog: {
      id: 'dog',
      name: 'Farm Dog',
      wage: 0,
      hireCost: 0,
      color: '#d99b43',
      hat: '#cf352e',
      desc: 'Unpaid friendly farm pup! Wanders the farm greeting guests and boosting happiness.'
    }
  };

  PT.MILESTONES = [
    {
      id: 'homestead',
      title: 'Cozy Homestead',
      desc: 'Sell 12 trees or seasonal harvests and reach a Farm Rating of 650.',
      reward: 350,
      check: (g) => g.stats.treesSold >= 12 && g.farmRating >= 650
    },
    {
      id: 'expansion',
      title: 'Growing Valley',
      desc: 'Expand your farm to 340+ owned tiles and earn $2,500 cash.',
      reward: 500,
      check: (g) => g.map.getOwnedCount() >= 340 && g.cash >= 2500
    },
    {
      id: 'wonderland',
      title: 'All-Season Wonderland',
      desc: 'Build at least 5 stalls/attractions and reach 780 Farm Rating.',
      reward: 750,
      check: (g) => g.getBuildingCount() >= 5 && g.farmRating >= 780
    },
    {
      id: 'empire',
      title: 'Valley Harvest Empire',
      desc: 'Sell 60+ trees & harvests, own 480+ tiles, and reach 860+ Farm Rating.',
      reward: 1500,
      check: (g) => g.stats.treesSold >= 60 && g.map.getOwnedCount() >= 480 && g.farmRating >= 860
    }
  ];

  PT.FIRST_NAMES = [
    'Clara', 'Arthur', 'Holly', 'Oliver', 'Nora', 'Henry', 'Ruby', 'Theo',
    'Evelyn', 'Milo', 'Hazel', 'Caleb', 'Ivy', 'Lucas', 'Grace', 'Jack',
    'Sadie', 'Leo', 'Willa', 'Sam', 'June', 'Owen', 'Poppy', 'Eli'
  ];
  PT.LAST_INITIALS = 'ABCDEFGHJKLMNOPRSTW';

  PT.DOG_NAMES = [
    'Barnaby', 'Maple', 'Biscuit', 'Clover', 'Buddy', 'Waffles',
    'Pinecone', 'Rusty', 'Daisy', 'Pepper', 'Chestnut', 'Scout'
  ];

  PT.GUEST_COATS = [
    { coat: '#c43b35', hat: '#f0e8d5' },
    { coat: '#3769a6', hat: '#d95448' },
    { coat: '#3d824b', hat: '#e6b83c' },
    { coat: '#8a4999', hat: '#f2e9d8' },
    { coat: '#cc7b2b', hat: '#365e41' },
    { coat: '#2e8787', hat: '#cf4842' }
  ];
})();
