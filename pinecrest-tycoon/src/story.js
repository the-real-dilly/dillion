/* ==========================================================================
   A PINECREST CHRISTMAS — Full Hallmark-Style Cinematic Movie Engine
   8-Act Holiday Feature Film with Opening Title Card, Ken Burns Cinematography,
   Dynamic Weather/Snow/Bokeh, Adaptive Holiday Score, Voice Narration,
   Movie Transport Controls & Scrolling End Credits.
   Original Game Created by King.
   ========================================================================== */
(function () {
  const STORAGE_KEY = "pinecrest_movie_v2";

  const ACTS = [
    {
      id: "act1",
      num: "ACT I",
      title: "Home for the Holidays",
      tagline: "A city architect. A snowy mountain farm. One last Christmas.",
      img: "assets/story/ch1.jpg",
      mood: "warm",
      weather: "snow",
      goalText: "Opening Act — Unlocked from the start.",
      unlockCheck: () => true,
      beats: [
        {
          who: "NARRATOR",
          role: "Pinecrest Valley · November",
          voice: "narrator",
          text: "Three days after leaving her corner office in the city, Clara stands beneath the snowy timber archway of her late grandfather's Christmas tree farm.",
          cam: { s0: 1.04, s1: 1.15, x0: -1.8, x1: 1.6, y0: 0.4, y1: -1.2 },
          dur: 6800
        },
        {
          who: "CLARA",
          role: "City Architect & New Owner",
          voice: "clara",
          text: "Grandpa left me the deed... and a mountain of overdue bills. Everyone back in the city told me to sell before the first freeze, but look at this valley.",
          cam: { s0: 1.12, s1: 1.23, x0: 2.2, x1: 4.4, y0: -1.4, y1: -2.2 },
          dur: 7200
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "Name's Luke. Your grandfather taught me how to shape every spruce on this ridge. If you're staying through Christmas, grab a scarf—we've got a farm to bring back to life.",
          cam: { s0: 1.14, s1: 1.24, x0: -3.5, x1: -1.0, y0: -1.0, y1: -2.0 },
          dur: 7500
        }
      ]
    },
    {
      id: "act2",
      num: "ACT II",
      title: "Grandpa's Blueprints",
      tagline: "Inside the lantern-lit barn lies a dream half-finished.",
      img: "assets/story/act2.jpg",
      mood: "warm",
      weather: "bokeh",
      goalText: "Sell 6 Christmas trees or reach $1,650 cash to unlock Act II.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 6) || g.cash >= 1650 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "The Old Timber Barn · Dusk",
          voice: "narrator",
          text: "Inside the cedar barn, warm fairy lights flicker over dusty wreaths and a hand-drawn map of Pinecrest Valley spread across the workbench.",
          cam: { s0: 1.03, s1: 1.13, x0: -1.5, x1: 1.5, y0: 0.5, y1: -1.0 },
          dur: 6500
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          voice: "clara",
          text: "Wait—these are Grandpa's sketches! A hot cocoa pavilion by the pines, a tractor hayride loop, a winter market square... He planned this whole village!",
          cam: { s0: 1.14, s1: 1.24, x0: 2.0, x1: 0.0, y0: -1.0, y1: -2.0 },
          dur: 7200
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "He always said you had the architect's eye to finish it. You draw the paths, Clara—I'll fire up the saw and build every stall before December hits.",
          cam: { s0: 1.15, s1: 1.25, x0: -2.5, x1: -0.5, y0: -1.2, y1: -2.2 },
          dur: 7200
        }
      ]
    },
    {
      id: "act3",
      num: "ACT III",
      title: "The Developer's Ultimatum",
      tagline: "Big-city money wants the ridge. Christmas spirit stands in the way.",
      img: "assets/story/ch2.jpg",
      mood: "tense",
      weather: "snow",
      goalText: "Sell 15 Christmas trees or reach $2,500 cash to unlock Act III.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 15) || g.cash >= 2500 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "Late Afternoon · First Flurries",
          voice: "narrator",
          text: "Just as the first families return to Pinecrest, a gleaming black Range Rover crunches up the snowy gravel drive.",
          cam: { s0: 1.05, s1: 1.15, x0: 2.8, x1: -1.0, y0: 0, y1: -1.0 },
          dur: 6200
        },
        {
          who: "RICHARD VANCE",
          role: "Vance Luxury Resorts",
          voice: "vance",
          text: "Charming little hobby farm, Clara. Sign these papers and I'll turn this ridge into Pinecrest Alpine Condos by spring—unless you can clear the mortgage by Christmas Eve.",
          cam: { s0: 1.16, s1: 1.26, x0: 5.5, x1: 3.2, y0: -1.5, y1: -2.2 },
          dur: 7800
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "This valley isn't for sale, Vance. By Christmas Eve, every family in the county will be drinking hot cocoa right here under the evergreens.",
          cam: { s0: 1.14, s1: 1.24, x0: -5.0, x1: -2.8, y0: -1.2, y1: -2.0 },
          dur: 7200
        }
      ]
    },
    {
      id: "act4",
      num: "ACT IV",
      title: "The Holiday Market Awakens",
      tagline: "Lanterns glow, the red tractor rolls, and the valley comes alive.",
      img: "assets/story/act4.jpg",
      mood: "joyful",
      weather: "snow",
      goalText: "Sell 28 Christmas trees or reach $3,800 cash to unlock Act IV.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 28) || g.cash >= 3800 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "Golden Hour · First Weekend of December",
          voice: "narrator",
          text: "Word spreads fast through the mountain towns. By Saturday sunset, the vintage red tractor pulls laughing families past glowing stalls of cider, wreaths, and fresh-cut firs.",
          cam: { s0: 1.04, s1: 1.15, x0: -2.2, x1: 2.2, y0: 0.4, y1: -1.0 },
          dur: 7400
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          voice: "clara",
          text: "Luke, look at the line for the hayride! Kids are pulling their own Scotch pines on sleds—we might actually beat Vance's deadline!",
          cam: { s0: 1.14, s1: 1.24, x0: 1.5, x1: -1.2, y0: -0.8, y1: -1.8 },
          dur: 6800
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "Told you the valley just needed a spark. Keep planting those Fraser firs—the Christmas Eve rush hasn't even started yet.",
          cam: { s0: 1.12, s1: 1.22, x0: -2.0, x1: 0.5, y0: -0.5, y1: -1.5 },
          dur: 6800
        }
      ]
    },
    {
      id: "act5",
      num: "ACT V",
      title: "Cocoa by the Firelight",
      tagline: "Warm lights, fresh pine, and a heart finding its way home.",
      img: "assets/story/ch3.jpg",
      mood: "romantic",
      weather: "snow",
      goalText: "Sell 45 Christmas trees or reach $5,200 cash to unlock Act V.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 45) || g.cash >= 5200 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "December Night · Pinecrest Fire Pit",
          voice: "narrator",
          text: "After the last wagon rolls back to the barn, cinnamon and woodsmoke drift into the starry night while snow settles softly on the evergreens.",
          cam: { s0: 1.04, s1: 1.14, x0: -2.0, x1: 1.8, y0: 0.5, y1: -1.4 },
          dur: 6800
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          voice: "clara",
          text: "I spent five years designing glass towers in the city and never felt anything like this. Maybe Grandpa knew I needed Pinecrest more than it needed me.",
          cam: { s0: 1.14, s1: 1.24, x0: -1.5, x1: 0.8, y0: -1.4, y1: -2.4 },
          dur: 7400
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "Cheers to that, Clara. One more big night for the Christmas Eve Tree Lighting—just watch the sky, the barometer's dropping fast.",
          cam: { s0: 1.12, s1: 1.22, x0: 1.5, x1: -0.5, y0: -1.0, y1: -2.0 },
          dur: 7000
        }
      ]
    },
    {
      id: "act6",
      num: "ACT VI",
      title: "The Christmas Eve Blizzard",
      tagline: "When the storm rolls in, the whole town grabs a lantern.",
      img: "assets/story/act6.jpg",
      mood: "storm",
      weather: "blizzard",
      goalText: "Sell 60 Christmas trees or reach $6,800 cash to unlock Act VI.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 60) || g.cash >= 6800 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "Christmas Eve · 5:00 PM · Whiteout",
          voice: "narrator",
          text: "Hours before the Tree Lighting, a fierce mountain squall sweeps across Pinecrest Ridge, burying the market lanes and threatening to cancel the festival—and hand the farm to Vance.",
          cam: { s0: 1.06, s1: 1.18, x0: -2.5, x1: 2.5, y0: 0.5, y1: -1.2 },
          dur: 7600
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          voice: "clara",
          text: "The main road is drifting over... If nobody can make it up the ridge tonight, we'll miss the mortgage payment by midnight!",
          cam: { s0: 1.15, s1: 1.25, x0: 1.5, x1: -1.0, y0: -1.2, y1: -2.2 },
          dur: 6800
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "Look behind us, Clara! Half the town just hiked up through the snow with lanterns and shovels. Pinecrest never lets a storm win on Christmas Eve!",
          cam: { s0: 1.13, s1: 1.23, x0: -3.0, x1: 0.5, y0: -0.8, y1: -1.8 },
          dur: 7500
        }
      ]
    },
    {
      id: "act7",
      num: "ACT VII",
      title: "The Pinecrest Miracle",
      tagline: "One switch lights the entire valley in Christmas gold.",
      img: "assets/story/ch4.jpg",
      mood: "triumph",
      weather: "snow",
      goalText: "Sell 75 Christmas trees, reach $9,000 cash, or reach Year 2 to unlock Act VII!",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 75) || g.cash >= 9000 || g.year >= 2),
      rewardCash: 2500,
      beats: [
        {
          who: "NARRATOR",
          role: "Christmas Eve · Midnight",
          voice: "narrator",
          text: "As the clouds part beneath a silver crescent moon, the entire town gathers around the towering Pinecrest spruce. One flip of the switch turns the whole valley to gold.",
          cam: { s0: 1.03, s1: 1.14, x0: 0, x1: 0, y0: 1.5, y1: -1.5 },
          dur: 7400
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          voice: "clara",
          text: "We did it! Every family came, the mortgage is paid in full, and Richard Vance just withdrew his offer. Pinecrest Farm belongs to the valley forever!",
          cam: { s0: 1.14, s1: 1.25, x0: -1.0, x1: 0.5, y0: -1.2, y1: -2.4 },
          dur: 7400
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "Merry Christmas, Clara. Welcome home to Pinecrest. (+$2,500 Holiday Miracle Bonus awarded!)",
          cam: { s0: 1.18, s1: 1.28, x0: 0.5, x1: 0, y0: -2.0, y1: -2.8 },
          dur: 7400
        }
      ]
    },
    {
      id: "act8",
      num: "EPILOGUE",
      title: "Christmas Morning",
      tagline: "A new tradition begins under the sunlit evergreens.",
      img: "assets/story/act8.jpg",
      mood: "warm",
      weather: "bokeh",
      goalText: "Unlocks alongside Act VII — The Pinecrest Miracle.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 75) || g.cash >= 9000 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "Christmas Morning · Pinecrest Farmhouse",
          voice: "narrator",
          text: "Morning sunlight sparkles across miles of fresh snow. Outside the frosted window, rows of young pines stand ready for a hundred Christmases to come.",
          cam: { s0: 1.03, s1: 1.13, x0: -1.5, x1: 1.5, y0: 0.4, y1: -1.0 },
          dur: 7000
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          voice: "clara",
          text: "I called my old firm this morning and told them I'm not coming back. My favorite blueprint is right outside that window.",
          cam: { s0: 1.12, s1: 1.22, x0: 1.2, x1: -0.5, y0: -1.0, y1: -2.0 },
          dur: 7000
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          voice: "luke",
          text: "Good thing, too—because next year we're expanding across the river. Merry Christmas, Clara.",
          cam: { s0: 1.15, s1: 1.24, x0: -0.5, x1: 0.5, y0: -1.2, y1: -2.2 },
          dur: 7000
        }
      ]
    }
  ];

  const TOTAL_BEATS = ACTS.reduce((a, c) => a + c.beats.length, 0);
  const TOTAL_MOVIE_MS = 3800 + ACTS.reduce((a, c) => a + c.beats.reduce((b, x) => b + x.dur, 0), 0);

  const state = loadState();
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { seen: raw.seen || {}, rewarded: raw.rewarded || {} };
    } catch (_) {
      return { seen: {}, rewarded: {} };
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  /* ---------- Hallmark Cinema CSS ---------- */
  const style = document.createElement("style");
  style.textContent = `
    #hm-overlay {
      position: fixed; inset: 0; z-index: 9999; display: none; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 45%, #160f10 0%, #050405 100%);
      font-family: Georgia, "Times New Roman", serif; color: #fff8eb; user-select: none;
    }
    #hm-overlay.open { display: flex; animation: hmFadeIn .55s ease; }
    @keyframes hmFadeIn { from { opacity: 0; } to { opacity: 1; } }

    #hm-stage {
      position: relative; width: min(1140px, 96vw); aspect-ratio: 16 / 9; overflow: hidden;
      background: #000; border: 2px solid rgba(255,214,138,.45);
      box-shadow: 0 30px 100px rgba(0,0,0,.95), 0 0 70px rgba(255,180,70,.2);
      border-radius: 6px;
    }
    /* Anamorphic cinema letterbox bars */
    .hm-bar { position: absolute; left: 0; right: 0; height: 6.5%; background: #040304; z-index: 4; pointer-events: none; }
    .hm-bar.top { top: 0; border-bottom: 1px solid rgba(255,214,138,.12); }
    .hm-bar.bot { bottom: 0; border-top: 1px solid rgba(255,214,138,.12); }

    #hm-img {
      position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover;
      will-change: transform, opacity; filter: contrast(1.05) saturate(1.08);
      transition: opacity .65s ease;
    }
    #hm-snow { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
    #hm-vig {
      position: absolute; inset: 0; pointer-events: none; z-index: 3;
      background:
        linear-gradient(180deg, rgba(8,5,6,.72) 0%, rgba(8,5,6,0) 24%, rgba(8,5,6,0) 58%, rgba(8,5,6,.92) 100%),
        radial-gradient(ellipse at 50% 45%, rgba(255,210,130,0) 46%, rgba(10,5,7,.58) 100%);
    }

    /* Opening Title Card & Act Intertitle Curtain */
    #hm-curtain {
      position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column;
      align-items: center; justify-content: center; text-align: center; padding: 32px;
      background: radial-gradient(circle at 50% 48%, rgba(44,14,18,.96), rgba(6,4,6,.99));
      opacity: 0; pointer-events: none; transition: opacity .65s ease;
    }
    #hm-curtain.show { opacity: 1; pointer-events: auto; }
    #hm-curtain .hm-kicker {
      font: 700 12px/1.2 system-ui, sans-serif; letter-spacing: .32em; color: #ffd479;
      text-transform: uppercase; margin-bottom: 12px;
    }
    #hm-curtain h1 {
      margin: 0 0 10px; font: 700 clamp(28px, 4.4vw, 52px)/1.08 Georgia, serif;
      color: #fffaf0; text-shadow: 0 4px 24px rgba(255,190,90,.35);
    }
    #hm-curtain .hm-sub {
      font: italic clamp(14px, 1.7vw, 20px)/1.4 Georgia, serif; color: rgba(255,235,205,.86);
      max-width: 620px; margin: 0 0 18px;
    }
    #hm-curtain .hm-by {
      font: 600 11px/1 system-ui, sans-serif; letter-spacing: .22em; color: rgba(255,214,138,.72);
      text-transform: uppercase;
    }

    /* Scrolling End Credits */
    #hm-credits {
      position: absolute; inset: 0; z-index: 9; display: none; overflow: hidden;
      background: radial-gradient(circle at 50% 50%, rgba(26,10,13,.94), rgba(5,4,6,.98));
    }
    #hm-credits.show { display: block; }
    #hm-credits-roll {
      position: absolute; left: 0; right: 0; text-align: center; padding: 0 24px;
      animation: hmCreditsScroll 20s linear forwards;
    }
    @keyframes hmCreditsScroll {
      0% { transform: translateY(100%); }
      100% { transform: translateY(-108%); }
    }
    #hm-credits-roll h2 { font: 700 34px/1.2 Georgia, serif; color: #ffd984; margin: 0 0 8px; }
    #hm-credits-roll .cr-sub { font: italic 16px/1.4 Georgia, serif; color: rgba(255,236,205,.82); margin-bottom: 34px; }
    #hm-credits-roll .cr-role { font: 700 11px/1.2 system-ui, sans-serif; letter-spacing: .24em; color: #ffd479; text-transform: uppercase; margin-top: 22px; }
    #hm-credits-roll .cr-name { font: 400 20px/1.4 Georgia, serif; color: #fffaf0; margin: 4px 0 0; }
    #hm-credits-foot {
      position: absolute; bottom: 0; left: 0; right: 0; padding: 26px 0 22px;
      background: linear-gradient(180deg, rgba(6,4,6,0) 0%, rgba(6,4,6,.96) 55%);
      display: flex; justify-content: center; gap: 12px; z-index: 10;
    }

    /* Top HUD inside stage */
    #hm-top {
      position: absolute; top: 8.5%; left: 22px; right: 22px; z-index: 6;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    }
    #hm-badge { display: inline-flex; flex-direction: column; gap: 2px; text-shadow: 0 2px 12px rgba(0,0,0,.95); }
    #hm-chap { font: 700 11px/1.2 system-ui, sans-serif; letter-spacing: .24em; color: #ffd479; text-transform: uppercase; }
    #hm-title { font: 700 clamp(18px, 2.2vw, 26px)/1.1 Georgia, serif; color: #fff9ee; }
    #hm-tag { font: italic 12.5px/1.2 Georgia, serif; color: rgba(255,236,205,.82); }
    #hm-top-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .hm-btn {
      font: 600 11.5px/1 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase;
      color: #fff6e5; background: rgba(20,12,14,.82); border: 1px solid rgba(255,214,138,.45);
      padding: 7px 11px; border-radius: 4px; cursor: pointer; backdrop-filter: blur(4px);
    }
    .hm-btn:hover { background: rgba(168,38,44,.9); border-color: #ffe09a; }
    .hm-btn.gold { background: linear-gradient(180deg, #b83232, #7e1c20); border-color: #ffd479; color: #fff; }
    .hm-btn.on { border-color: #ffd479; color: #ffe4a3; }

    /* Bottom Subtitle & Movie Transport */
    #hm-bottom {
      position: absolute; left: 22px; right: 22px; bottom: 8%; z-index: 6;
      display: flex; flex-direction: column; gap: 9px;
    }
    #hm-dialog {
      background: rgba(12,8,10,.78); border-left: 3px solid #ffd479; border-radius: 0 6px 6px 0;
      padding: 11px 16px; backdrop-filter: blur(6px); max-width: 860px;
    }
    #hm-who-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
    #hm-who { font: 700 12.5px/1 system-ui, sans-serif; letter-spacing: .16em; color: #ffd479; text-transform: uppercase; }
    #hm-role { font: italic 12px/1 Georgia, serif; color: rgba(255,232,200,.72); }
    #hm-text { font: 400 clamp(14px, 1.5vw, 17.5px)/1.45 Georgia, serif; color: #fffaf0; text-shadow: 0 1px 4px rgba(0,0,0,.9); }

    #hm-controls {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      background: rgba(10,7,9,.68); padding: 7px 10px; border-radius: 5px; border: 1px solid rgba(255,214,138,.2);
    }
    #hm-dots { display: flex; align-items: center; gap: 5px; }
    .hm-dot {
      width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(255,214,138,.55);
      background: rgba(255,255,255,.14); cursor: pointer; padding: 0; transition: transform .15s, background .15s;
    }
    .hm-dot.done { background: rgba(255,212,121,.55); }
    .hm-dot.cur { background: #e04848; border-color: #ffd479; transform: scale(1.28); }
    #hm-prog { flex: 1; min-width: 90px; height: 4px; background: rgba(255,255,255,.18); border-radius: 2px; overflow: hidden; }
    #hm-prog-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #e04848, #ffd479); }
    #hm-time { font: 600 11px/1 monospace; color: rgba(255,232,195,.82); }
    #hm-credit { font: 600 10.5px/1 system-ui, sans-serif; letter-spacing: .12em; color: rgba(255,220,160,.65); text-transform: uppercase; }

    /* Story & Full Movie Menu Modal */
    #hm-menu {
      position: fixed; inset: 0; z-index: 9998; display: none; align-items: center; justify-content: center;
      background: rgba(8,6,8,.82); backdrop-filter: blur(5px);
    }
    #hm-menu.open { display: flex; }
    #hm-card {
      width: min(680px, 94vw); max-height: 88vh; overflow-y: auto;
      background: linear-gradient(180deg, #241618, #130d0f); color: #fff6e6;
      border: 2px solid #c99c4a; border-radius: 8px; padding: 20px 22px;
      box-shadow: 0 24px 70px rgba(0,0,0,.88); font-family: system-ui, sans-serif;
    }
    #hm-card h2 { margin: 0 0 4px; font: 700 23px/1.2 Georgia, serif; color: #ffd984; }
    #hm-card .hm-sub { margin: 0 0 14px; font-size: 13px; color: rgba(255,235,205,.8); }
    .hm-hero-play {
      display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
      background: linear-gradient(135deg, rgba(168,36,42,.42), rgba(201,156,74,.22));
      border: 1.5px solid #ffd479; border-radius: 7px; padding: 12px 14px; margin-bottom: 14px;
    }
    .hm-hero-play h3 { margin: 0 0 3px; font: 700 16px/1.2 Georgia, serif; color: #fff8ea; }
    .hm-hero-play p { margin: 0; font-size: 12px; color: rgba(255,235,205,.84); }
    .hm-ch-row {
      display: grid; grid-template-columns: 108px 1fr auto; gap: 12px; align-items: center;
      background: rgba(255,255,255,.045); border: 1px solid rgba(255,214,138,.2);
      border-radius: 6px; padding: 8px; margin-bottom: 8px;
    }
    .hm-ch-row img { width: 108px; height: 61px; object-fit: cover; border-radius: 4px; display: block; }
    .hm-ch-row.locked img { filter: grayscale(.75) brightness(.6); }
    .hm-ch-row h4 { margin: 0 0 2px; font: 700 13.5px/1.2 Georgia, serif; color: #fff6e5; }
    .hm-ch-row p { margin: 0; font-size: 12px; color: rgba(255,230,200,.72); line-height: 1.3; }
    .hm-menu-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 10px; flex-wrap: wrap; }

    /* Floating Hallmark Movie Pill on HUD */
    #btn-story {
      position: fixed; top: 58px; right: 14px; z-index: 900;
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 14px; border-radius: 999px; cursor: pointer;
      background: linear-gradient(180deg, #b52a2e 0%, #7d171c 100%);
      color: #fff7e8; border: 1.5px solid #ffd479;
      font: 700 13px/1 Georgia, serif; letter-spacing: .03em;
      box-shadow: 0 6px 20px rgba(0,0,0,.45), 0 0 14px rgba(255,204,102,.32);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    #btn-story:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,.55), 0 0 22px rgba(255,214,120,.5); }
  `;
  document.head.appendChild(style);

  /* ---------- Build DOM ---------- */
  const overlay = document.createElement("div");
  overlay.id = "hm-overlay";
  overlay.innerHTML = `
    <div id="hm-stage">
      <img id="hm-img" src="" alt="A Pinecrest Christmas movie frame">
      <canvas id="hm-snow"></canvas>
      <div id="hm-vig"></div>
      <div class="hm-bar top"></div>
      <div class="hm-bar bot"></div>

      <div id="hm-curtain">
        <div class="hm-kicker" id="hm-c-kick"></div>
        <h1 id="hm-c-title"></h1>
        <div class="hm-sub" id="hm-c-sub"></div>
        <div class="hm-by" id="hm-c-by"></div>
      </div>

      <div id="hm-credits">
        <div id="hm-credits-roll">
          <h2>A Pinecrest Christmas</h2>
          <div class="cr-sub">A Pinecrest Tycoon Holiday Feature Film</div>
          <div class="cr-role">Original Game Created By</div>
          <div class="cr-name">King</div>
          <div class="cr-role">Starring</div>
          <div class="cr-name">Clara Vance-Holloway — The City Architect</div>
          <div class="cr-name">Luke Mercer — Head Carpenter &amp; Tree Grower</div>
          <div class="cr-name">Richard Vance — Vance Luxury Resorts</div>
          <div class="cr-name">The Townsfolk of Pinecrest Valley</div>
          <div class="cr-role">Filmed On Location</div>
          <div class="cr-name">Pinecrest Ridge · Evergreen Barn · Holiday Market Square</div>
          <div class="cr-role">Original Holiday Score</div>
          <div class="cr-name">Pinecrest Celesta &amp; Strings Ensemble</div>
          <div class="cr-role">Thank You For Playing</div>
          <div class="cr-name">Merry Christmas from Pinecrest Tycoon!</div>
        </div>
        <div id="hm-credits-foot">
          <button class="hm-btn gold" id="hm-replay-movie">↻ Replay Full Movie</button>
          <button class="hm-btn" id="hm-credits-close">Return to Farm</button>
        </div>
      </div>

      <div id="hm-top">
        <div id="hm-badge">
          <span id="hm-chap"></span>
          <span id="hm-title"></span>
          <span id="hm-tag"></span>
        </div>
        <div id="hm-top-btns">
          <button class="hm-btn on" id="hm-voice">🗣 Voice: ON</button>
          <button class="hm-btn on" id="hm-music-btn">🎵 Score: ON</button>
          <button class="hm-btn" id="hm-skip">Close ✕</button>
        </div>
      </div>

      <div id="hm-bottom">
        <div id="hm-dialog">
          <div id="hm-who-row">
            <span id="hm-who"></span>
            <span id="hm-role"></span>
          </div>
          <div id="hm-text"></div>
        </div>
        <div id="hm-controls">
          <button class="hm-btn" id="hm-prev" title="Previous Scene">⏮</button>
          <button class="hm-btn gold" id="hm-playpause" title="Play / Pause (Space)">⏸ Pause</button>
          <button class="hm-btn" id="hm-next" title="Next Scene">⏭</button>
          <div id="hm-dots"></div>
          <div id="hm-prog"><div id="hm-prog-fill"></div></div>
          <span id="hm-time">0:00 / 2:55</span>
          <span id="hm-credit">BY KING</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const menu = document.createElement("div");
  menu.id = "hm-menu";
  menu.innerHTML = `
    <div id="hm-card">
      <h2>🎬 A Pinecrest Christmas — Full Movie</h2>
      <p class="hm-sub">An 8-Act Hallmark-style holiday feature film for Pinecrest Tycoon · Created by <strong>King</strong></p>
      <div class="hm-hero-play">
        <div>
          <h3>▶ Watch the Full Feature Movie (All 8 Acts)</h3>
          <p>Opening Title Card · 8 Cinematic Acts · Voice Narration · Holiday Score · End Credits (~3 min)</p>
        </div>
        <button class="hm-btn gold" id="hm-full-movie" style="padding:10px 16px;font-size:12.5px;">▶ PLAY FULL MOVIE</button>
      </div>
      <div id="hm-list"></div>
      <div class="hm-menu-foot">
        <span style="font-size:12px;color:rgba(255,230,200,.7);">Acts also unlock automatically as your tree farm grows!</span>
        <button class="hm-btn" id="hm-menu-close">Back to Farm</button>
      </div>
    </div>
  `;
  document.body.appendChild(menu);

  /* ---------- Adaptive Web Audio Hallmark Score ---------- */
  let audioCtx = null, musicTimer = null, scoreOn = true;
  const SCALES = {
    warm:     [261.63, 329.63, 392.00, 523.25, 440.00, 392.00, 349.23, 329.63], // C major cozy
    joyful:   [293.66, 369.99, 440.00, 587.33, 493.88, 440.00, 392.00, 369.99], // D major bright
    romantic: [246.94, 311.13, 369.99, 493.88, 440.00, 392.00, 329.63, 293.66], // Warm ballad
    tense:    [220.00, 261.63, 329.63, 293.66, 261.63, 246.94, 220.00, 196.00], // A minor drama
    storm:    [196.00, 233.08, 293.66, 349.23, 293.66, 233.08, 196.00, 174.61], // G minor blizzard
    triumph:  [261.63, 329.63, 392.00, 523.25, 659.25, 587.33, 523.25, 392.00]  // Soaring finale
  };
  let curMood = "warm";

  function playNote(freq, dur, vol, type) {
    if (!audioCtx || !scoreOn) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || "triangle";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function startScore() {
    stopScore();
    if (!scoreOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (_) { return; }
    let step = 0;
    const tick = () => {
      if (!playing || !scoreOn) return;
      const scale = SCALES[curMood] || SCALES.warm;
      const n = scale[step % scale.length];
      playNote(n, 2.2, 0.045, "triangle");
      if (step % 2 === 0) playNote(n * 2, 1.3, 0.022, "sine"); // celesta sparkle
      if (step % 4 === 0) playNote(n * 0.5, 3.2, 0.035, "sine"); // warm string bass pad
      step++;
    };
    tick();
    musicTimer = setInterval(tick, 900);
  }
  function stopScore() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---------- Voice Narration (Web Speech API) ---------- */
  let voiceOn = true;
  function stopSpeech() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  }
  function speakBeat(beat) {
    stopSpeech();
    if (!voiceOn || !window.speechSynthesis || !beat || !beat.text) return;
    try {
      const u = new SpeechSynthesisUtterance(beat.text.replace(/\(\+\$2,500.*?\)/g, ""));
      u.volume = 0.85;
      if (beat.voice === "clara") { u.pitch = 1.15; u.rate = 0.98; }
      else if (beat.voice === "luke") { u.pitch = 0.88; u.rate = 0.95; }
      else if (beat.voice === "vance") { u.pitch = 0.82; u.rate = 1.02; }
      else { u.pitch = 0.96; u.rate = 0.94; }
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  /* ---------- Snow, Blizzard & Bokeh Canvas ---------- */
  const snowCv = overlay.querySelector("#hm-snow");
  const sctx = snowCv.getContext("2d");
  const flakes = Array.from({ length: 120 }, (_, i) => ({
    x: Math.random(), y: Math.random(),
    r: 1.2 + Math.random() * 2.8,
    vy: 0.04 + Math.random() * 0.11,
    vx: (Math.random() - 0.5) * 0.04,
    ph: Math.random() * Math.PI * 2,
    gold: i % 6 === 0
  }));

  /* ---------- Movie Playback Engine ---------- */
  const imgEl = overlay.querySelector("#hm-img");
  const chapEl = overlay.querySelector("#hm-chap");
  const titleEl = overlay.querySelector("#hm-title");
  const tagEl = overlay.querySelector("#hm-tag");
  const whoEl = overlay.querySelector("#hm-who");
  const roleEl = overlay.querySelector("#hm-role");
  const textEl = overlay.querySelector("#hm-text");
  const progEl = overlay.querySelector("#hm-prog-fill");
  const timeEl = overlay.querySelector("#hm-time");
  const dotsEl = overlay.querySelector("#hm-dots");
  const playPauseBtn = overlay.querySelector("#hm-playpause");
  const voiceBtn = overlay.querySelector("#hm-voice");
  const musicBtn = overlay.querySelector("#hm-music-btn");
  const curtainEl = overlay.querySelector("#hm-curtain");
  const creditsEl = overlay.querySelector("#hm-credits");

  let playing = false, paused = false, fullMovieMode = false;
  let playlist = [], plIdx = 0, beatIdx = 0;
  let beatStart = 0, pausedElapsed = 0, rafId = 0, wasGamePaused = false;
  let curtainTimer = null;

  function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function showCurtain(kicker, title, sub, by, ms, cb) {
    if (curtainTimer) clearTimeout(curtainTimer);
    overlay.querySelector("#hm-c-kick").textContent = kicker;
    overlay.querySelector("#hm-c-title").textContent = title;
    overlay.querySelector("#hm-c-sub").textContent = sub;
    overlay.querySelector("#hm-c-by").textContent = by || "";
    curtainEl.classList.add("show");
    curtainTimer = setTimeout(() => {
      curtainEl.classList.remove("show");
      if (cb) cb();
    }, ms);
  }

  function renderDots() {
    dotsEl.innerHTML = playlist.map((act, i) =>
      `<button class="hm-dot ${i < plIdx ? "done" : ""} ${i === plIdx ? "cur" : ""}" data-act="${i}" title="${act.num}: ${act.title}"></button>`
    ).join("");
    dotsEl.querySelectorAll(".hm-dot").forEach((d) => {
      d.addEventListener("click", () => {
        if (curtainTimer) clearTimeout(curtainTimer);
        curtainEl.classList.remove("show");
        plIdx = +d.dataset.act;
        beatIdx = 0;
        loadAct(playlist[plIdx], false);
      });
    });
  }

  function launchPlaylist(acts, isFullMovie) {
    menu.classList.remove("open");
    creditsEl.classList.remove("show");
    playlist = acts.slice();
    plIdx = 0;
    beatIdx = 0;
    fullMovieMode = !!isFullMovie;
    playing = true;
    paused = false;
    playPauseBtn.textContent = "⏸ Pause";

    const g = window.pinecrestGame;
    if (g) { wasGamePaused = g.paused; g.paused = true; }

    overlay.classList.add("open");
    curMood = playlist[0].mood || "warm";
    startScore();
    renderDots();

    if (fullMovieMode) {
      imgEl.src = playlist[0].img;
      showCurtain(
        "A PINECREST TYCOON ORIGINAL HOLIDAY FILM",
        "A Pinecrest Christmas",
        "An 8-Act Hallmark-Style Christmas Movie",
        "ORIGINAL GAME CREATED BY KING",
        3400,
        () => { if (playing) loadAct(playlist[0], false); }
      );
    } else {
      loadAct(playlist[0], false);
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(animLoop);
  }

  function loadAct(act, showIntertitle) {
    curMood = act.mood || "warm";
    chapEl.textContent = act.num;
    titleEl.textContent = act.title;
    tagEl.textContent = act.tagline;
    renderDots();

    state.seen[act.id] = true;
    if (act.rewardCash && !state.rewarded[act.id] && window.pinecrestGame) {
      window.pinecrestGame.cash += act.rewardCash;
      state.rewarded[act.id] = true;
    }
    saveState();

    imgEl.style.opacity = "0";
    setTimeout(() => {
      imgEl.src = act.img;
      imgEl.style.opacity = "1";
    }, 180);

    if (showIntertitle) {
      showCurtain(act.num, act.title, act.tagline, "", 2000, () => {
        if (playing) loadBeat(0);
      });
    } else {
      loadBeat(0);
    }
  }

  function loadBeat(idx) {
    const act = playlist[plIdx];
    if (!act) return;
    beatIdx = idx;
    const b = act.beats[beatIdx];
    whoEl.textContent = b.who;
    roleEl.textContent = b.role;
    textEl.textContent = b.text;
    beatStart = performance.now();
    pausedElapsed = 0;
    speakBeat(b);
  }

  function nextScene() {
    const act = playlist[plIdx];
    if (!act) return;
    if (beatIdx + 1 < act.beats.length) {
      loadBeat(beatIdx + 1);
    } else if (plIdx + 1 < playlist.length) {
      plIdx++;
      loadAct(playlist[plIdx], fullMovieMode);
    } else if (fullMovieMode) {
      showEndCredits();
    } else {
      closePlayer();
    }
  }

  function prevScene() {
    if (beatIdx > 0) {
      loadBeat(beatIdx - 1);
    } else if (plIdx > 0) {
      plIdx--;
      const act = playlist[plIdx];
      loadAct(act, false);
    } else {
      loadBeat(0);
    }
  }

  function showEndCredits() {
    if (curtainTimer) clearTimeout(curtainTimer);
    curtainEl.classList.remove("show");
    stopSpeech();
    curMood = "triumph";
    creditsEl.classList.add("show");
    const roll = creditsEl.querySelector("#hm-credits-roll");
    roll.style.animation = "none";
    void roll.offsetWidth;
    roll.style.animation = "hmCreditsScroll 20s linear forwards";
  }

  function closePlayer() {
    playing = false;
    paused = false;
    if (curtainTimer) clearTimeout(curtainTimer);
    curtainEl.classList.remove("show");
    creditsEl.classList.remove("show");
    overlay.classList.remove("open");
    stopScore();
    stopSpeech();
    cancelAnimationFrame(rafId);
    const g = window.pinecrestGame;
    if (g) g.paused = wasGamePaused;
  }

  function getElapsedMovieMs(now) {
    let ms = 0;
    for (let i = 0; i < plIdx; i++) {
      for (const b of playlist[i].beats) ms += b.dur;
    }
    const act = playlist[plIdx];
    if (act) {
      for (let j = 0; j < beatIdx; j++) ms += act.beats[j].dur;
      const cur = act.beats[beatIdx];
      ms += Math.min(cur.dur, paused ? pausedElapsed : Math.max(0, now - beatStart));
    }
    return ms;
  }

  function getTotalPlaylistMs() {
    return playlist.reduce((a, c) => a + c.beats.reduce((b, x) => b + x.dur, 0), 0) || 1;
  }

  function animLoop(now) {
    if (!playing) return;
    const act = playlist[plIdx];
    if (act && !curtainEl.classList.contains("show") && !creditsEl.classList.contains("show")) {
      const b = act.beats[beatIdx];
      const elapsed = paused ? pausedElapsed : (now - beatStart);
      const u = Math.min(1, Math.max(0, elapsed / b.dur));

      const s = b.cam.s0 + (b.cam.s1 - b.cam.s0) * u;
      const tx = b.cam.x0 + (b.cam.x1 - b.cam.x0) * u;
      const ty = b.cam.y0 + (b.cam.y1 - b.cam.y0) * u;
      imgEl.style.transform = `translate(${tx}%, ${ty}%) scale(${s})`;

      const totMs = getTotalPlaylistMs();
      const elMs = getElapsedMovieMs(now);
      progEl.style.width = `${Math.min(100, (elMs / totMs) * 100)}%`;
      timeEl.textContent = `${fmtTime(elMs)} / ${fmtTime(totMs)}`;

      if (!paused && u >= 1) nextScene();
    }

    // Dynamic Snow / Blizzard / Bokeh Layer
    const w = snowCv.clientWidth || 960, h = snowCv.clientHeight || 540;
    if (snowCv.width !== w || snowCv.height !== h) { snowCv.width = w; snowCv.height = h; }
    sctx.clearRect(0, 0, w, h);
    const weather = (act && act.weather) || "snow";
    const dt = 1 / 60;
    for (const f of flakes) {
      if (weather === "blizzard") {
        f.y = (f.y + f.vy * 2.4 * dt) % 1;
        f.x = (f.x + (0.34 + f.vx) * dt + 1) % 1;
      } else {
        f.y = (f.y + f.vy * dt) % 1;
        f.x = (f.x + (f.vx + Math.sin(now * 0.001 + f.ph) * 0.015) * dt + 1) % 1;
      }
      if (weather === "bokeh" && !f.gold) continue;
      sctx.beginPath();
      sctx.arc(f.x * w, f.y * h, f.gold ? f.r * 2.4 : f.r, 0, Math.PI * 2);
      sctx.fillStyle = f.gold
        ? "rgba(255,214,120,0.22)"
        : (weather === "blizzard" ? "rgba(235,245,255,0.85)" : "rgba(255,255,255,0.72)");
      sctx.fill();
    }

    rafId = requestAnimationFrame(animLoop);
  }

  /* ---------- Controls Wiring ---------- */
  overlay.querySelector("#hm-next").addEventListener("click", nextScene);
  overlay.querySelector("#hm-prev").addEventListener("click", prevScene);
  overlay.querySelector("#hm-skip").addEventListener("click", closePlayer);
  overlay.querySelector("#hm-credits-close").addEventListener("click", closePlayer);
  overlay.querySelector("#hm-replay-movie").addEventListener("click", () => launchPlaylist(ACTS, true));

  playPauseBtn.addEventListener("click", () => {
    paused = !paused;
    if (paused) {
      pausedElapsed = performance.now() - beatStart;
      playPauseBtn.textContent = "▶ Play";
      stopSpeech();
    } else {
      beatStart = performance.now() - pausedElapsed;
      playPauseBtn.textContent = "⏸ Pause";
    }
  });

  voiceBtn.addEventListener("click", () => {
    voiceOn = !voiceOn;
    voiceBtn.textContent = voiceOn ? "🗣 Voice: ON" : "🗣 Voice: OFF";
    voiceBtn.classList.toggle("on", voiceOn);
    if (!voiceOn) stopSpeech();
  });

  musicBtn.addEventListener("click", () => {
    scoreOn = !scoreOn;
    musicBtn.textContent = scoreOn ? "🎵 Score: ON" : "🎵 Score: OFF";
    musicBtn.classList.toggle("on", scoreOn);
    if (scoreOn && playing) startScore();
    else stopScore();
  });

  window.addEventListener("keydown", (e) => {
    if (!playing) return;
    if (e.code === "Space") { e.preventDefault(); playPauseBtn.click(); }
    else if (e.code === "ArrowRight") { e.preventDefault(); nextScene(); }
    else if (e.code === "ArrowLeft") { e.preventDefault(); prevScene(); }
    else if (e.code === "Escape") { e.preventDefault(); closePlayer(); }
  });

  /* ---------- Movie & Chapters Menu ---------- */
  function openStoryMenu() {
    const g = window.pinecrestGame;
    const list = menu.querySelector("#hm-list");
    list.innerHTML = ACTS.map((act, idx) => {
      const unlocked = act.unlockCheck(g) || !!state.seen[act.id];
      return `
        <div class="hm-ch-row ${unlocked ? "" : "locked"}">
          <img src="${act.img}" alt="${act.title}">
          <div>
            <h4>${act.num}: ${act.title}</h4>
            <p>${unlocked ? act.tagline : "🔒 " + act.goalText}</p>
          </div>
          <button class="hm-btn ${unlocked ? "gold" : ""}" data-play="${idx}">${unlocked ? (state.seen[act.id] ? "Watch ▶" : "Play ▶") : "Preview ▶"}</button>
        </div>
      `;
    }).join("");
    list.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", () => launchPlaylist([ACTS[+btn.dataset.play]], false));
    });
    menu.classList.add("open");
  }

  menu.querySelector("#hm-menu-close").addEventListener("click", () => menu.classList.remove("open"));
  menu.querySelector("#hm-full-movie").addEventListener("click", () => launchPlaylist(ACTS, true));

  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.createElement("button");
    btn.id = "btn-story";
    btn.title = "Watch 'A Pinecrest Christmas' Full Movie";
    btn.innerHTML = '<span>🎬</span><span>Watch Movie</span>';
    btn.addEventListener("click", openStoryMenu);
    document.body.appendChild(btn);

    // Auto-play Act I on first visit (after 0.9s so farm renders behind it)
    setTimeout(() => {
      if (!state.seen.act1 && !playing) launchPlaylist([ACTS[0]], false);
    }, 900);

    // Watch farm milestones to auto-trigger Acts II–VIII in order
    setInterval(() => {
      const g = window.pinecrestGame;
      if (!g || playing) return;
      for (let i = 1; i < ACTS.length; i++) {
        const act = ACTS[i];
        const prev = ACTS[i - 1];
        if (!state.seen[act.id] && state.seen[prev.id] && act.unlockCheck(g)) {
          launchPlaylist([act], false);
          break;
        }
      }
    }, 1800);
  });

  window.PTStory = {
    openMenu: openStoryMenu,
    playAct: (i) => launchPlaylist([ACTS[i]], false),
    playChapter: (i) => launchPlaylist([ACTS[i]], false),
    playFullMovie: () => launchPlaylist(ACTS, true),
    showCredits: () => { launchPlaylist([ACTS[7]], true); showEndCredits(); }
  };
})();
