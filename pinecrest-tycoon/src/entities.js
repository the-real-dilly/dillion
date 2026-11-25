(function () {
  const PT = (window.PT = window.PT || {});

  let nextEntityId = 1;

  function randomGuestName() {
    const f = PT.FIRST_NAMES[Math.floor(Math.random() * PT.FIRST_NAMES.length)];
    const l = PT.LAST_INITIALS[Math.floor(Math.random() * PT.LAST_INITIALS.length)];
    return `${f} ${l}.`;
  }

  class Guest {
    constructor(x, y, isWinter) {
      this.id = nextEntityId++;
      this.kind = 'guest';
      this.name = randomGuestName();
      this.x = x;
      this.y = y;
      this.coatIdx = Math.floor(Math.random() * PT.GUEST_COATS.length);
      this.walkPhase = Math.random() * 10;

      // RCT-style Peep Stats (0..100)
      this.happiness = 72 + Math.floor(Math.random() * 15);
      this.warmth = isWinter ? (55 + Math.floor(Math.random() * 25)) : 90;
      this.hunger = 25 + Math.floor(Math.random() * 35);
      this.cash = 110 + Math.floor(Math.random() * 340);
      this.wantsTree = Math.random() < (isWinter ? 0.86 : 0.78);

      this.carryingTree = null; // { type, name, stageName, price, category, icon } once picked
      this.paidForTree = false;
      this.rodeTractor = false;
      this.rodeBoat = false;
      this.boat = null;
      this.targetStopIdx = -1;
      this.destStopIdx = -1;
      this.waitTimer = 0;
      this.itemsBought = [];

      this.state = 'browse'; // browse | to_tree | picking | to_checkout | checking_out | to_stall | using_stall | to_tractor | waiting_tractor | riding_tractor | to_boat_dock | paddling_boat | leaving
      this.targetTile = null;
      this.path = [];
      this.timer = 0;
      this.exploreStrolls = 1 + (Math.random() < 0.7 ? 1 : 0);
      this.visitsDone = 0;
      this.maxVisits = 3 + Math.floor(Math.random() * 3);
      this.thought = this.wantsTree
        ? (isWinter ? 'Looking around for the perfect Christmas tree!' : 'Exploring the farm for fresh seasonal harvests!')
        : 'Taking a lovely stroll around the farm!';
    }

    update(dt, game) {
      // Riding aboard the tow-behind tractor wagon!
      if (this.state === 'riding_tractor') {
        if (!game.tractor || !game.tractor.riders.includes(this)) {
          this.state = 'browse';
          return true;
        }
        this.happiness = Math.min(100, this.happiness + dt * 1.15);
        return true;
      }

      // Paddling a rented rowboat around the pond!
      if (this.state === 'paddling_boat') {
        if (!game.boatDock || !this.boat || !game.boatDock.boats.includes(this.boat)) {
          const shore = game.map.findAdjacentWalkable(Math.round(this.x), Math.round(this.y)) || game.map.entrance;
          this.x = shore.x;
          this.y = shore.y;
          this.boat = null;
          this.state = 'browse';
          return true;
        }
        this.happiness = Math.min(100, this.happiness + dt * 1.4);
        return true;
      }

      const season = game.getSeason();
      const isCold = season.id === 'winter' || game.month === 10;

      // Ambient need drift
      if (isCold) {
        this.warmth = Math.max(0, this.warmth - dt * 1.15);
        if (this.warmth < 28) {
          this.happiness = Math.max(10, this.happiness - dt * 1.4);
          if (this.state === 'browse') this.thought = "Brrr! I need Hot Cocoa or a Fire Pit!";
        }
      } else {
        this.warmth = Math.min(100, this.warmth + dt * 2);
      }

      this.hunger = Math.min(100, this.hunger + dt * 0.85);

      // Scenery mood boost near themed decor & paths
      const curTile = game.map.get(Math.round(this.x), Math.round(this.y));
      if (curTile) {
        if (curTile.path) this.happiness = Math.min(100, this.happiness + dt * 0.25);
        if (curTile.decor && curTile.decor !== 'fence' && curTile.decor !== 'gate') {
          this.happiness = Math.min(100, this.happiness + dt * 0.65);
        }
      }

      // Move along path if any
      if (this.path.length > 0) {
        const next = this.path[0];
        const dx = next.x - this.x;
        const dy = next.y - this.y;
        const dist = Math.hypot(dx, dy);
        const onPath = curTile && curTile.path;
        const speed = (onPath ? 2.15 : 1.45) * (this.carryingTree ? 0.88 : 1.0);
        this.walkPhase += dt * speed * 4.2;

        if (dist <= speed * dt) {
          this.x = next.x;
          this.y = next.y;
          this.path.shift();
        } else {
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }
        return true;
      }

      // Arrived at destination or choosing next goal
      if (this.timer > 0) {
        this.timer -= dt;
        return true;
      }

      switch (this.state) {
        case 'browse':
          this.chooseNextGoal(game);
          break;

        case 'to_tree':
          this.arriveAtTree(game);
          break;

        case 'picking':
          this.finishPickingTree(game);
          break;

        case 'to_checkout':
          this.arriveAtCheckout(game);
          break;

        case 'checking_out':
          this.finishCheckout(game);
          break;

        case 'to_stall':
          this.arriveAtStall(game);
          break;

        case 'using_stall':
          this.finishStall(game);
          break;

        case 'to_tractor':
          this.arriveAtTractorStop(game);
          break;

        case 'waiting_tractor':
          this.waitForTractor(dt, game);
          break;

        case 'to_boat_dock':
          this.arriveAtBoatDock(game);
          break;

        case 'leaving':
          // Reached entrance road -> despawn
          return false;
      }

      return true;
    }

    sendToExplore(game, countAsVisit = false) {
      const spot = game.findExploreTile(this.x, this.y) || game.findRandomWalkableTile();
      if (!spot) return false;
      const p = game.map.findPath(this.x, this.y, spot.x, spot.y);
      if (p.length === 0) return false;
      if (countAsVisit) this.visitsDone++;
      this.path = p;
      this.timer = 0.7 + Math.random() * 0.9;
      const thoughts = [
        'Strolling through the farm to see everything!',
        'Exploring the groves before choosing what to buy!',
        'Taking in the fresh pine breeze!',
        'Wandering deeper into the farm to look around!'
      ];
      this.thought = thoughts[Math.floor(Math.random() * thoughts.length)];
      return true;
    }

    chooseNextGoal(game) {
      // 0. Newly arrived guests wander & spread out across the farm before deciding what to buy!
      if (this.exploreStrolls > 0 && this.warmth >= 35 && this.hunger <= 75) {
        this.exploreStrolls--;
        // Occasional early Tractor Ride also carries guests deep into the farm
        if (
          !this.rodeTractor &&
          game.tractor &&
          game.tractor.isReadyForGuests() &&
          this.cash >= game.tractor.price &&
          Math.random() < 0.25
        ) {
          const stopChoice = game.tractor.findNearestStop(this.x, this.y, game);
          if (stopChoice) {
            const stand = game.map.findAdjacentWalkable(stopChoice.stop.x, stopChoice.stop.y);
            if (stand) {
              const p = game.map.findPath(this.x, this.y, stand.x, stand.y);
              if (p.length > 0 || (Math.round(this.x) === stand.x && Math.round(this.y) === stand.y)) {
                this.targetStopIdx = stopChoice.idx;
                this.path = p;
                this.state = 'to_tractor';
                this.thought = `Hopping on the Tractor Ride at Stop #${stopChoice.idx + 1} to tour the farm!`;
                return;
              }
            }
          }
        }
        if (this.sendToExplore(game, false)) return;
      }

      // 1. If cold, prioritize Fire Pit or Hot Cocoa!
      if (this.warmth < 45) {
        const warmSpot = game.findBestBuilding(['cocoa', 'firepit'], this.x, this.y, this.cash);
        if (warmSpot) {
          this.sendToStall(game, warmSpot, warmSpot.building.type === 'cocoa'
            ? 'Heading for a steaming Hot Cocoa!'
            : 'Going to warm up by the crackling Fire Pit!');
          return;
        }
      }

      // 2. If hungry, try Cider & Donuts or Cocoa
      if (this.hunger > 62) {
        const foodSpot = game.findBestBuilding(['cider', 'cocoa'], this.x, this.y, this.cash);
        if (foodSpot) {
          this.sendToStall(game, foodSpot, 'Those cider donuts smell incredible!');
          return;
        }
      }

      // 2a. Occasional scenic stroll between stops so guests keep circulating across the whole farm
      if (!this.carryingTree && !this.paidForTree && this.visitsDone < this.maxVisits && Math.random() < 0.25) {
        if (this.sendToExplore(game, false)) return;
      }

      // 2b. Take a scenic Tractor Wagon Ride between farm stops!
      if (
        !this.carryingTree &&
        !this.rodeTractor &&
        this.visitsDone < this.maxVisits &&
        game.tractor &&
        game.tractor.isReadyForGuests() &&
        this.cash >= game.tractor.price &&
        Math.random() < 0.42
      ) {
        const stopChoice = game.tractor.findNearestStop(this.x, this.y, game);
        if (stopChoice) {
          const stand = game.map.findAdjacentWalkable(stopChoice.stop.x, stopChoice.stop.y);
          if (stand) {
            const p = game.map.findPath(this.x, this.y, stand.x, stand.y);
            if (p.length > 0 || (Math.round(this.x) === stand.x && Math.round(this.y) === stand.y)) {
              this.targetStopIdx = stopChoice.idx;
              this.path = p;
              this.state = 'to_tractor';
              this.thought = `Heading to Stop #${stopChoice.idx + 1} for the Tractor Wagon Ride!`;
              return;
            }
          }
        }
      }

      // 2c. Rent a rowboat (open water) or ice skates (frozen winter pond)!
      if (
        !this.carryingTree &&
        !this.rodeBoat &&
        this.visitsDone < this.maxVisits &&
        game.boatDock &&
        game.boatDock.isReadyForGuests(game) &&
        this.cash >= game.boatDock.price &&
        Math.random() < 0.42
      ) {
        const shore = game.map.findAdjacentWalkable(game.boatDock.x, game.boatDock.y);
        if (shore) {
          const p = game.map.findPath(this.x, this.y, shore.x, shore.y);
          if (p.length > 0 || (Math.round(this.x) === shore.x && Math.round(this.y) === shore.y)) {
            this.path = p;
            this.state = 'to_boat_dock';
            this.thought = game.boatDock.isFrozen(game)
              ? 'Heading to the dock to rent ice skates!'
              : 'Heading to the dock to rent a rowboat!';
            return;
          }
        }
      }

      // 3. Visit a fun holiday attraction / wreath barn before or after tree shopping
      if (this.visitsDone < this.maxVisits && Math.random() < 0.48) {
        const funSpot = game.findBestBuilding(['santa', 'reindeer', 'wreath', 'cocoa', 'cider', 'firepit'], this.x, this.y, this.cash);
        if (funSpot) {
          const def = PT.BUILDINGS[funSpot.building.type];
          this.sendToStall(game, funSpot, `Checking out ${def.name}!`);
          return;
        }
      }

      // 4. Shop for a Christmas tree if they want one and haven't bought one yet
      if (this.wantsTree && !this.carryingTree) {
        const treeTile = game.findBestSellableTree(this.x, this.y, this.cash);
        const checkout = game.findBestBuilding(['checkout'], this.x, this.y, 9999);
        if (treeTile && checkout) {
          const stand = game.map.findAdjacentWalkable(treeTile.x, treeTile.y);
          if (stand) {
            const p = game.map.findPath(this.x, this.y, stand.x, stand.y);
            if (p.length > 0 || (Math.round(this.x) === stand.x && Math.round(this.y) === stand.y)) {
              treeTile.tree.reservedBy = this.id;
              this.targetTile = treeTile;
              this.path = p;
              this.state = 'to_tree';
              this.thought = `Ooh! That ${PT.TREES[treeTile.tree.type].name} looks wonderful!`;
              return;
            }
          }
        } else if (!checkout) {
          this.happiness = Math.max(20, this.happiness - 8);
          this.thought = 'Where is the Saw & Checkout Shed to pay for our harvest?';
        } else if (!treeTile) {
          this.thought = 'No mature trees or crops ready in my budget yet...';
        }
      }

      // 5. Done visiting -> head back to Farm Entrance Gate
      if (this.visitsDone >= this.maxVisits || this.paidForTree || (this.visitsDone >= 2 && Math.random() < 0.18)) {
        this.headToExit(game);
        return;
      }

      // Otherwise wander to a scenic owned area deeper in the farm
      if (!this.sendToExplore(game, true)) {
        this.visitsDone++;
        const wander = game.findRandomWalkableTile();
        if (wander) {
          this.path = game.map.findPath(this.x, this.y, wander.x, wander.y);
          this.timer = this.path.length > 0 ? 0.6 : (1.0 + Math.random() * 0.5);
          this.thought = this.happiness > 75 ? 'This Christmas tree farm is so charming!' : 'Strolling through the pines.';
        } else {
          this.headToExit(game);
        }
      }
    }

    sendToStall(game, tile, thought) {
      const stand = game.map.findAdjacentWalkable(tile.x, tile.y);
      if (!stand) {
        this.visitsDone++;
        this.timer = 0.6;
        return;
      }
      const p = game.map.findPath(this.x, this.y, stand.x, stand.y);
      if (p.length === 0 && (Math.round(this.x) !== stand.x || Math.round(this.y) !== stand.y)) {
        this.visitsDone++;
        this.timer = 0.6;
        return;
      }
      this.targetTile = tile;
      this.path = p;
      this.state = 'to_stall';
      this.thought = thought;
    }

    arriveAtTree(game) {
      const t = this.targetTile;
      if (!t || !t.tree || t.tree.reservedBy !== this.id) {
        this.state = 'browse';
        return;
      }
      const def = PT.TREES[t.tree.type];
      const isEvergreen = !def || def.category === 'tree';
      const speedBonus = (isEvergreen && game.hasStaffRole('lumberjack')) ? 0.65 : 1.0;
      this.state = 'picking';
      this.timer = (isEvergreen ? 1.6 : 1.2) * speedBonus;
      if (isEvergreen) {
        this.thought = 'Sawing down our Christmas tree!';
        PT.audio.chop();
      } else if (def.category === 'orchard') {
        this.thought = `Picking crisp apples from the ${def.name}!`;
        PT.audio.plant();
      } else {
        this.thought = `Picking fresh ${def.name}!`;
        PT.audio.plant();
      }
    }

    finishPickingTree(game) {
      const t = this.targetTile;
      if (!t || !t.tree) {
        this.state = 'browse';
        return;
      }
      const price = game.getTreeSalePrice(t.tree);
      const def = PT.TREES[t.tree.type];
      const stage = game.getTreeStage(t.tree);

      this.carryingTree = {
        type: t.tree.type,
        name: def.name,
        stageName: stage.name,
        price,
        category: def.category || 'tree',
        icon: def.icon || '🎄'
      };
      // Harvest plant (evergreens leave stump, crops clear cleanly, apple trees regrow!)
      game.harvestPlantTile(t);
      game.spawnSparkles(t.x, t.y, '#8cc474', 7);

      // Walk to nearest Checkout Shed
      const checkout = game.findBestBuilding(['checkout'], this.x, this.y, 9999);
      if (checkout) {
        const stand = game.map.findAdjacentWalkable(checkout.x, checkout.y);
        if (stand) {
          this.targetTile = checkout;
          this.path = game.map.findPath(this.x, this.y, stand.x, stand.y);
          this.state = 'to_checkout';
          this.thought = `Bringing my ${stage.name} ${def.name} to Checkout!`;
          return;
        }
      }
      // Fallback: pay immediately if checkout disappeared mid-cut
      this.completeTreePayment(game, null);
    }

    arriveAtCheckout(game) {
      const t = this.targetTile;
      if (!t || !t.building || t.building.type !== 'checkout') {
        this.completeTreePayment(game, null);
        return;
      }
      const speedBonus = game.hasStaffRole('lumberjack') ? 0.6 : 1.0;
      this.state = 'checking_out';
      this.timer = PT.BUILDINGS.checkout.serviceTime * speedBonus;
      this.thought = this.carryingTree && this.carryingTree.category !== 'tree'
        ? 'Paying for our fresh farm harvest!'
        : 'Getting the tree netted and paying up!';
    }

    finishCheckout(game) {
      this.completeTreePayment(game, this.targetTile);
    }

    completeTreePayment(game, checkoutTile) {
      if (this.carryingTree && !this.paidForTree) {
        const sale = this.carryingTree.price;
        this.cash = Math.max(0, this.cash - sale);
        this.paidForTree = true;
        this.itemsBought.push(`${this.carryingTree.stageName} ${this.carryingTree.name}`);
        this.happiness = Math.min(100, this.happiness + 18);

        const fx = checkoutTile ? checkoutTile.x : this.x;
        const fy = checkoutTile ? checkoutTile.y : this.y;
        game.recordTreeSale(sale, fx, fy, checkoutTile ? checkoutTile.building : null, this.carryingTree.name, this.carryingTree.type);
      }
      this.visitsDone++;
      this.thought = this.carryingTree && this.carryingTree.category !== 'tree'
        ? `Best fresh ${this.carryingTree.name} in the valley!`
        : 'We got the best tree on the block! Merry Christmas!';
      this.headToExit(game);
    }

    arriveAtStall(game) {
      const t = this.targetTile;
      if (!t || !t.building || !t.building.open) {
        this.state = 'browse';
        return;
      }
      const def = PT.BUILDINGS[t.building.type];
      this.state = 'using_stall';
      this.timer = def.serviceTime;
      if (t.building.type === 'firepit') {
        this.thought = 'Aahh, warming my hands by the fire!';
      } else {
        this.thought = `Visiting ${def.name}...`;
      }
    }

    finishStall(game) {
      const t = this.targetTile;
      this.visitsDone++;
      if (t && t.building && t.building.open) {
        const b = t.building;
        const def = PT.BUILDINGS[b.type];
        const price = b.price;
        // Price fairness check like RCT!
        const fairPrice = def.defaultPrice;
        if (price > fairPrice * 1.45 && fairPrice > 0) {
          this.happiness = Math.max(15, this.happiness - 10);
          this.thought = `${def.name} is way too pricey!`;
        } else if (this.cash >= price) {
          this.cash -= price;
          b.served++;
          if (price > 0) {
            b.revenue += price;
            game.addCash(price, 'stalls', t.x, t.y);
          }

          if (b.type === 'cocoa') {
            this.warmth = Math.min(100, this.warmth + 55);
            this.hunger = Math.max(0, this.hunger - 22);
            this.happiness = Math.min(100, this.happiness + 14);
            this.itemsBought.push('Hot Cocoa');
            this.thought = 'This Hot Cocoa is heavenly!';
          } else if (b.type === 'cider') {
            this.warmth = Math.min(100, this.warmth + 25);
            this.hunger = Math.max(0, this.hunger - 55);
            this.happiness = Math.min(100, this.happiness + 14);
            this.itemsBought.push('Cider & Donut');
            this.thought = 'Warm apple cider donuts—so good!';
          } else if (b.type === 'wreath') {
            this.happiness = Math.min(100, this.happiness + 16);
            this.itemsBought.push('Pine Wreath');
            this.thought = 'This handmade wreath will look great on our front door!';
          } else if (b.type === 'firepit') {
            this.warmth = Math.min(100, this.warmth + 60);
            this.happiness = Math.min(100, this.happiness + 10);
            this.thought = 'Toasty warm and ready to keep exploring!';
          } else if (b.type === 'reindeer') {
            this.happiness = Math.min(100, this.happiness + 22);
            this.thought = 'The reindeer are adorable! One had a shiny red nose!';
          } else if (b.type === 'santa') {
            this.happiness = Math.min(100, this.happiness + 28);
            this.itemsBought.push('Santa Photo');
            this.thought = 'Best holiday photo with Santa ever!';
          }
        }
      }
      this.targetTile = null;
      this.state = 'browse';
    }

    arriveAtTractorStop(game) {
      if (!game.tractor || !game.tractor.isReadyForGuests() || this.targetStopIdx < 0 || this.targetStopIdx >= game.tractor.stops.length) {
        this.state = 'browse';
        return;
      }
      this.state = 'waiting_tractor';
      this.waitTimer = 22;
      this.thought = `Waiting at Stop #${this.targetStopIdx + 1} for the tractor wagon!`;
      if (game.tractor.state === 'waiting' && game.tractor.stopIdx === this.targetStopIdx) {
        game.tractor.boardGuest(this, game);
      }
    }

    waitForTractor(dt, game) {
      if (!game.tractor || !game.tractor.isReadyForGuests() || this.targetStopIdx < 0 || this.targetStopIdx >= game.tractor.stops.length) {
        this.state = 'browse';
        return;
      }
      if (game.tractor.state === 'waiting' && game.tractor.stopIdx === this.targetStopIdx) {
        if (game.tractor.boardGuest(this, game)) return;
      }
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) {
        this.thought = 'Guess I will walk and explore the farm!';
        this.state = 'browse';
      }
    }

    arriveAtBoatDock(game) {
      if (!game.boatDock || !game.boatDock.isReadyForGuests(game)) {
        this.state = 'browse';
        return;
      }
      if (!game.boatDock.launchBoatForGuest(this, game)) {
        this.state = 'browse';
      }
    }

    headToExit(game) {
      if (this.targetTile && this.targetTile.tree && this.targetTile.tree.reservedBy === this.id) {
        this.targetTile.tree.reservedBy = null;
      }
      this.targetTile = null;
      const ex = game.map.entrance.x;
      const ey = game.map.roadY;
      this.path = game.map.findPath(this.x, this.y, ex, ey);
      this.state = 'leaving';
      if (this.path.length === 0) {
        this.path = [{ x: ex, y: ey }];
      }
    }
  }

  class Staff {
    constructor(role, x, y) {
      this.id = nextEntityId++;
      this.kind = 'staff';
      this.role = role;
      const namePool = role === 'dog' ? PT.DOG_NAMES : PT.FIRST_NAMES;
      this.name = `${PT.STAFF_TYPES[role].name} ${namePool[Math.floor(Math.random() * namePool.length)]}`;
      this.x = x;
      this.y = y;
      this.dirX = 1;
      this.dirY = 0;
      this.walkPhase = Math.random() * 10;
      this.path = [];
      this.targetTile = null;
      this.taskType = null; // 'plant' | 'trim' | 'stump' | 'checkout' | 'patrol' | 'wander' | 'greet' | null
      this.timer = 0;
      this.greetTimer = 0;
      this.heartCooldown = 0;
      this.greetedGuests = new Map();
      this.tasksDone = 0;
      this.status = role === 'dog' ? 'Wandering around the farm' : 'Patrolling the farm';
    }

    clearTask() {
      this.targetTile = null;
      this.taskType = null;
      this.path = [];
      this.timer = 0;
    }

    isCurrentTaskValid(game) {
      const t = this.targetTile;
      if (!t || !this.taskType) return true;
      if (this.taskType === 'harvest') {
        return game.isTileHarvestableByForester(t);
      }
      if (this.taskType === 'plant') {
        const def = t.plot ? PT.TREES[t.plot] : null;
        return !!(def && game.isTilePlantableForPlot(t) && game.cash >= def.cost);
      }
      if (this.taskType === 'trim') {
        return !!(t.owned && t.tree && !t.tree.trimmed);
      }
      if (this.taskType === 'stump') {
        return !!(t.owned && t.stump);
      }
      if (this.taskType === 'checkout') {
        return !!(t.building && t.building.type === 'checkout' && t.building.open);
      }
      return true;
    }

    update(dt, game) {
      // Abort & reassign immediately if target was already handled by a guest/player
      if (this.targetTile && !this.isCurrentTaskValid(game)) {
        this.clearTask();
      }

      // Farm dogs cheerfully greet nearby guests as they roam
      if (this.role === 'dog') {
        if (this.heartCooldown > 0) this.heartCooldown = Math.max(0, this.heartCooldown - dt);
        for (const [gid, rem] of this.greetedGuests) {
          if (rem - dt <= 0) this.greetedGuests.delete(gid);
          else this.greetedGuests.set(gid, rem - dt);
        }
        this.greetTimer -= dt;
        if (this.greetTimer <= 0) {
          this.greetTimer = 0.35;
          this.greetNearbyGuests(game, 2.8);
        }
      }

      if (this.path.length > 0) {
        const next = this.path[0];
        const dx = next.x - this.x;
        const dy = next.y - this.y;
        const dist = Math.hypot(dx, dy);
        const speed = this.role === 'dog' ? 2.25 : 2.0;
        if (dist > 0.001) {
          this.dirX = dx;
          this.dirY = dy;
        }
        this.walkPhase += dt * speed * 4.5;
        if (dist <= speed * dt) {
          this.x = next.x;
          this.y = next.y;
          this.path.shift();
        } else {
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }
        return;
      }

      if (this.timer > 0) {
        if (this.role === 'dog') this.walkPhase += dt * 3.5; // happy tail wag while resting
        this.timer -= dt;
        if (this.timer <= 0) this.completeTask(game);
        return;
      }

      this.findNextTask(game);
    }

    greetNearbyGuests(game, radius = 2.8) {
      const dogThoughts = [
        'Aww, what a good farm dog!',
        'Petting the farm dog made my day!',
        'Such a friendly pup roaming the pines!'
      ];
      let cheered = 0;
      for (const g of game.guests) {
        if (this.greetedGuests.has(g.id)) continue;
        if (Math.hypot(g.x - this.x, g.y - this.y) <= radius) {
          this.greetedGuests.set(g.id, 12);
          g.happiness = Math.min(100, g.happiness + 12);
          if (g.warmth >= 28 && (g.state === 'browse' || g.state === 'to_tree' || g.state === 'to_stall')) {
            g.thought = dogThoughts[Math.floor(Math.random() * dogThoughts.length)];
          }
          this.tasksDone++;
          this.status = `Making ${g.name} smile!`;
          game.spawnSparkles(g.x, g.y, '#ff9eb5', 4);
          if (this.heartCooldown <= 0) {
            game.addFloatText(this.x, this.y, '♥', '#ff9eb5');
            this.heartCooldown = 2.2;
          }
          cheered++;
        }
      }
      return cheered;
    }

    findNextTask(game) {
      this.clearTask();

      if (this.role === 'forester') {
        // 1. Scan for closest mature Management Plot harvest, empty plot tile, untrimmed plant, or stray stump
        let bestHarvest = null;
        let bestHarvestD = 1e9;
        let bestPlant = null;
        let bestPlantD = 1e9;
        let bestTree = null;
        let bestTreeD = 1e9;
        let bestStump = null;
        let bestStumpD = 1e9;

        for (let y = 0; y < game.map.size; y++) {
          for (let x = 0; x < game.map.size; x++) {
            const t = game.map.tiles[y][x];
            if (!t.owned) continue;
            if (game.isTileClaimedByStaff(t, this.id)) continue;

            if (game.isTileHarvestableByForester(t)) {
              const d = Math.hypot(x - this.x, y - this.y);
              if (d < bestHarvestD) { bestHarvestD = d; bestHarvest = t; }
            } else if (t.plot && game.isTilePlantableForPlot(t)) {
              const def = PT.TREES[t.plot];
              if (def && game.cash >= def.cost) {
                const d = Math.hypot(x - this.x, y - this.y);
                if (d < bestPlantD) { bestPlantD = d; bestPlant = t; }
              }
            } else if (t.tree && !t.tree.trimmed && t.tree.growth >= 25) {
              const d = Math.hypot(x - this.x, y - this.y);
              if (d < bestTreeD) { bestTreeD = d; bestTree = t; }
            } else if (t.stump) {
              const d = Math.hypot(x - this.x, y - this.y);
              if (d < bestStumpD) { bestStumpD = d; bestStump = t; }
            }
          }
        }

        // Priority: harvest mature Management Plots -> plant open plot tiles -> trim/tend plants -> clear stumps
        const candidates = [
          bestHarvest ? { tile: bestHarvest, type: 'harvest' } : null,
          bestPlant ? { tile: bestPlant, type: 'plant' } : null,
          bestTree ? { tile: bestTree, type: 'trim' } : null,
          bestStump ? { tile: bestStump, type: 'stump' } : null
        ].filter(Boolean);

        for (const cand of candidates) {
          const best = cand.tile;
          const stand = game.map.findAdjacentWalkable(best.x, best.y) || { x: best.x, y: best.y };
          const atStand = Math.round(this.x) === stand.x && Math.round(this.y) === stand.y;
          const p = atStand ? [] : game.map.findPath(this.x, this.y, stand.x, stand.y);
          if (atStand || p.length > 0) {
            this.targetTile = best;
            this.taskType = cand.type;
            this.path = p;
            this.timer = cand.type === 'plant' ? 1.2 : (cand.type === 'harvest' ? 1.5 : 1.4);
            if (cand.type === 'harvest') {
              this.status = `Harvesting ${PT.TREES[best.tree.type].name} from plot`;
            } else if (cand.type === 'plant') {
              this.status = `Planting ${PT.TREES[best.plot].name} in plot`;
            } else if (cand.type === 'stump') {
              this.status = 'Clearing tree stump';
            } else {
              this.status = 'Heading to tend a plant';
            }
            return;
          }
        }
      } else if (this.role === 'lumberjack') {
        // Spread lumberjacks evenly across open Checkout Sheds (unclaimed first)
        const sheds = [];
        for (let y = 0; y < game.map.size; y++) {
          for (let x = 0; x < game.map.size; x++) {
            const t = game.map.tiles[y][x];
            if (t.building && t.building.type === 'checkout' && t.building.open) {
              const assigned = game.countStaffClaimingTile(t, this.id, 'lumberjack');
              const d = Math.hypot(x - this.x, y - this.y);
              sheds.push({ tile: t, assigned, d });
            }
          }
        }
        sheds.sort((a, b) => (a.assigned - b.assigned) || (a.d - b.d));

        for (const entry of sheds) {
          const shed = entry.tile;
          const stand = game.map.findAdjacentWalkable(shed.x, shed.y);
          if (!stand) continue;
          const nearShed = Math.hypot(shed.x - this.x, shed.y - this.y) <= 2.2;
          const p = nearShed ? [] : game.map.findPath(this.x, this.y, stand.x, stand.y);
          if (nearShed || p.length > 0) {
            this.targetTile = shed;
            this.taskType = 'checkout';
            this.path = p;
            this.timer = 2.0;
            this.status = 'Assisting at Saw & Checkout Shed';
            return;
          }
        }
      } else if (this.role === 'dog') {
        // Sometimes trot over to greet a guest on the farm
        if (game.guests.length > 0 && Math.random() < 0.45) {
          const candidates = game.guests.filter(g => g.state !== 'leaving' && !this.greetedGuests.has(g.id));
          const pool = candidates.length > 0 ? candidates : game.guests.filter(g => g.state !== 'leaving');
          if (pool.length > 0) {
            const targetGuest = pool[Math.floor(Math.random() * pool.length)];
            const stand = game.map.findAdjacentWalkable(Math.round(targetGuest.x), Math.round(targetGuest.y));
            if (stand) {
              const p = game.map.findPath(this.x, this.y, stand.x, stand.y);
              if (p.length > 0) {
                this.targetTile = game.map.get(stand.x, stand.y);
                this.taskType = 'greet';
                this.path = p;
                this.timer = 1.6;
                this.status = 'Trotting over to greet guests';
                return;
              }
            }
          }
        }

        // Otherwise freely wander anywhere across the owned farm
        let spot = null;
        for (let attempt = 0; attempt < 8; attempt++) {
          const candidate = game.findRandomWalkableTile(false);
          if (!candidate) break;
          if (!spot || Math.hypot(candidate.x - this.x, candidate.y - this.y) >= 3.0) {
            spot = candidate;
            if (Math.hypot(candidate.x - this.x, candidate.y - this.y) >= 3.0) break;
          }
        }
        if (spot) {
          const wanderStatuses = [
            'Wandering around the farm',
            'Sniffing the pine trees',
            'Exploring the tree groves',
            'Trotting along the trails'
          ];
          this.targetTile = spot;
          this.taskType = 'wander';
          this.path = game.map.findPath(this.x, this.y, spot.x, spot.y);
          this.timer = 1.4 + Math.random() * 1.4;
          this.status = game.isSnowing
            ? 'Chasing snowflakes around the farm'
            : wanderStatuses[Math.floor(Math.random() * wanderStatuses.length)];
        } else {
          this.timer = 1.2 + Math.random() * 0.5;
        }
        return;
      }

      // Handyman (or idle staff): patrol unclaimed paths and tidy up
      let spot = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = game.findRandomWalkableTile(true);
        if (!candidate) break;
        if (!game.isTileClaimedByStaff(candidate, this.id)) {
          spot = candidate;
          break;
        }
        if (!spot) spot = candidate;
      }
      if (spot) {
        this.targetTile = spot;
        this.taskType = 'patrol';
        this.path = game.map.findPath(this.x, this.y, spot.x, spot.y);
        this.timer = this.path.length > 0 ? 1.6 : (1.2 + Math.random() * 0.5);
        this.status = this.role === 'handyman' ? 'Sweeping walkways & snow' : 'Checking tree groves';
      } else {
        this.timer = 1.2 + Math.random() * 0.5;
      }
    }

    completeTask(game) {
      const t = this.targetTile;
      if (this.role === 'forester' && t) {
        if (this.taskType === 'harvest' && game.isTileHarvestableByForester(t)) {
          const plantType = t.tree.type;
          const def = PT.TREES[plantType];
          const sale = Math.round(game.getTreeSalePrice(t.tree) * 0.85);
          game.harvestPlantTile(t);
          game.recordPlantSold(plantType);
          game.addCash(sale, 'trees', t.x, t.y);
          game.spawnSparkles(t.x, t.y, '#ffd859', 7);
          if (def && def.category !== 'tree') PT.audio.plant();
          else PT.audio.chop();
          this.tasksDone++;
          this.status = `Harvested ${def ? def.name : 'crop'} (+$${sale})!`;
          game.checkMilestones();
        } else if (this.taskType === 'plant' && t.plot && game.isTilePlantableForPlot(t)) {
          const def = PT.TREES[t.plot];
          if (def && game.cash >= def.cost) {
            t.stump = false;
            t.tree = { type: def.id, growth: 4, trimmed: false, reservedBy: null };
            game.map.bumpRevision();
            game.stats.treesPlanted++;
            game.addCash(-def.cost, 'planting', t.x, t.y);
            game.spawnSparkles(t.x, t.y, '#88d474', 5);
            PT.audio.plant();
            this.tasksDone++;
            this.status = `Planted ${def.name} in plot!`;
          }
        } else if (this.taskType === 'trim' && t.tree && !t.tree.trimmed) {
          const def = PT.TREES[t.tree.type];
          const isCrop = def && def.category !== 'tree';
          t.tree.trimmed = true;
          this.tasksDone++;
          this.status = isCrop ? `Tended ${def.name} to Premium quality!` : 'Trimmed a tree to Premium shape!';
          game.spawnSparkles(t.x, t.y, '#ffe570', 6);
          game.addFloatText(t.x, t.y, isCrop ? '✨ Tended!' : '✂ Trimmed!', '#fff199');
        } else if (this.taskType === 'stump' && t.stump) {
          t.stump = false;
          game.map.bumpRevision();
          this.tasksDone++;
          this.status = 'Cleared an old stump';
          game.spawnSparkles(t.x, t.y, '#c9a679', 5);
        }
      } else if (this.role === 'handyman') {
        this.tasksDone++;
        // Boost nearby guests' happiness slightly
        for (const g of game.guests) {
          if (Math.hypot(g.x - this.x, g.y - this.y) < 3.5) {
            g.happiness = Math.min(100, g.happiness + 4);
          }
        }
      } else if (this.role === 'lumberjack') {
        this.tasksDone++;
      } else if (this.role === 'dog') {
        const cheered = this.greetNearbyGuests(game, 3.4);
        if (!cheered) {
          this.status = 'Wagging tail happily';
        }
      }
      this.targetTile = null;
      this.taskType = null;
    }
  }

  class Tractor {
    constructor(x, y) {
      this.id = nextEntityId++;
      this.kind = 'tractor';
      this.name = PT.TRACTOR_DEF.name;
      this.x = x;
      this.y = y;
      this.dirX = 0;
      this.dirY = -1;
      this.wagonX = x;
      this.wagonY = y + 0.95;
      this.wagonDirX = 0;
      this.wagonDirY = -1;
      this.trail = [
        { x: this.wagonX, y: this.wagonY },
        { x: this.x, y: this.y }
      ];
      this.wheelPhase = 0;
      this.stops = []; // [{ x, y }, ...]
      this.stopIdx = 0;
      this.state = 'idle'; // 'idle' | 'driving' | 'waiting'
      this.waitTimer = 0;
      this.retryTimer = 0;
      this.path = [];
      this.riders = [];
      this.open = true;
      this.price = PT.TRACTOR_DEF.defaultPrice;
      this.revenue = 0;
      this.served = 0;
      this.status = 'Add 2+ stops to start route';
    }

    isReadyForGuests() {
      return this.open && this.stops.length >= 2;
    }

    findNearestStop(gx, gy, game) {
      let best = null;
      let bestD = 1e9;
      for (let i = 0; i < this.stops.length; i++) {
        const s = this.stops[i];
        if (!game.map.isTractorDrivable(s.x, s.y)) continue;
        const d = Math.hypot(s.x - gx, s.y - gy);
        if (d < bestD) {
          bestD = d;
          best = { idx: i, stop: s };
        }
      }
      return best;
    }

    syncTrailAfterTeleport() {
      this.wagonX = this.x - this.dirX * 0.95;
      this.wagonY = this.y - this.dirY * 0.95;
      this.wagonDirX = this.dirX;
      this.wagonDirY = this.dirY;
      this.trail = [
        { x: this.wagonX, y: this.wagonY },
        { x: this.x, y: this.y }
      ];
    }

    updateWagonPosition() {
      const HITCH_DIST = 0.95;
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(this.x - last.x, this.y - last.y) >= 0.04) {
        this.trail.push({ x: this.x, y: this.y });
      }

      // Sample backwards along the tractor's exact driven trail so the wagon tracks cleanly around corners
      let acc = 0;
      let found = false;
      for (let i = this.trail.length - 1; i > 0; i--) {
        const a = this.trail[i];
        const b = this.trail[i - 1];
        const segLen = Math.hypot(a.x - b.x, a.y - b.y);
        if (segLen < 1e-5) continue;
        if (acc + segLen >= HITCH_DIST) {
          const remain = HITCH_DIST - acc;
          const t = remain / segLen;
          this.wagonX = a.x + (b.x - a.x) * t;
          this.wagonY = a.y + (b.y - a.y) * t;
          this.wagonDirX = (a.x - b.x) / segLen;
          this.wagonDirY = (a.y - b.y) / segLen;
          // Trim older trail points well behind the wagon
          if (i > 4) this.trail.splice(0, i - 4);
          found = true;
          break;
        }
        acc += segLen;
      }

      if (!found && this.trail.length > 0) {
        const first = this.trail[0];
        this.wagonX = first.x;
        this.wagonY = first.y;
      }

      // Keep seated guests synced to wagon position
      for (const r of this.riders) {
        r.x = this.wagonX;
        r.y = this.wagonY;
      }
    }

    update(dt, game) {
      // Remove any riders that left the game
      this.riders = this.riders.filter(r => game.guests.includes(r));

      if (!this.open || this.stops.length < 2) {
        if (this.riders.length > 0) this.unloadAllRiders(game);
        this.path = [];
        this.state = 'idle';
        this.status = !this.open ? 'Ride closed' : 'Add at least 2 stops to run';
        return;
      }

      if (this.stopIdx >= this.stops.length) this.stopIdx = 0;

      if (this.state === 'idle') {
        if (this.retryTimer > 0) {
          this.retryTimer -= dt;
          return;
        }
        this.planToNextReachableStop(game, false);
        return;
      }

      if (this.state === 'waiting') {
        this.waitTimer -= dt;
        this.boardWaitingGuests(game);
        const secs = Math.max(0, Math.ceil(this.waitTimer));
        this.status = `Waiting at Stop #${this.stopIdx + 1} (${this.riders.length}/${PT.TRACTOR_DEF.capacity} riders • ${secs}s)`;
        if (this.waitTimer <= 0) {
          this.stopIdx = (this.stopIdx + 1) % this.stops.length;
          this.planToNextReachableStop(game, false);
        }
        return;
      }

      if (this.state === 'driving') {
        if (this.path.length === 0) {
          this.arriveAtStop(game);
          return;
        }

        const next = this.path[0];
        // Never pass through a newly placed tree, building, decor, or stump!
        if (!game.map.isTractorDrivable(next.x, next.y)) {
          this.path = [];
          this.planToNextReachableStop(game, false);
          return;
        }

        const dx = next.x - this.x;
        const dy = next.y - this.y;
        const dist = Math.hypot(dx, dy);
        const speed = PT.TRACTOR_DEF.speed;

        if (dist > 0.001) {
          this.dirX = dx / dist;
          this.dirY = dy / dist;
        }

        this.wheelPhase += dt * speed * 4.5;

        if (dist <= speed * dt) {
          this.x = next.x;
          this.y = next.y;
          this.path.shift();
        } else {
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }

        this.updateWagonPosition();

        // Cute tractor exhaust puffs while driving (capped via spawnParticle)
        if (Math.random() < Math.min(dt, 0.08) * 4.5) {
          game.spawnParticle({
            tx: this.x,
            ty: this.y,
            vx: -3 + Math.random() * 6,
            vy: -14 - Math.random() * 8,
            px: 4,
            py: -24,
            color: 'rgba(225, 230, 235, 0.65)',
            size: 3,
            age: 0,
            life: 0.9
          });
        }

        this.status = `Driving to Stop #${this.stopIdx + 1} (${this.riders.length}/${PT.TRACTOR_DEF.capacity} riders)`;

        if (this.path.length === 0) {
          this.arriveAtStop(game);
        }
      }
    }

    planToNextReachableStop(game, advanceFirst = false) {
      if (this.stops.length < 2) {
        this.state = 'idle';
        this.status = 'Add at least 2 stops to run';
        return false;
      }

      const startIdx = advanceFirst ? (this.stopIdx + 1) % this.stops.length : this.stopIdx;
      for (let offset = 0; offset < this.stops.length; offset++) {
        const idx = (startIdx + offset) % this.stops.length;
        const st = this.stops[idx];
        if (!game.map.isTractorDrivable(st.x, st.y)) continue;

        const atStop = Math.round(this.x) === st.x && Math.round(this.y) === st.y;
        if (atStop) {
          this.stopIdx = idx;
          this.path = [];
          this.arriveAtStop(game);
          return true;
        }

        const p = game.map.findTractorPath(this.x, this.y, st.x, st.y);
        if (p.length > 0) {
          this.stopIdx = idx;
          this.path = p;
          this.state = 'driving';
          this.status = `Driving to Stop #${idx + 1} (${this.riders.length}/${PT.TRACTOR_DEF.capacity} riders)`;
          return true;
        }
      }

      // No stops currently reachable (blocked by trees/structures/decor)
      this.path = [];
      this.state = 'idle';
      this.retryTimer = 1.5;
      this.status = 'Path blocked! Clear obstacles or adjust stops';
      return false;
    }

    arriveAtStop(game) {
      this.state = 'waiting';
      this.waitTimer = PT.TRACTOR_DEF.waitSeconds;
      const unloaded = this.unloadRidersAtCurrentStop(game);
      const boarded = this.boardWaitingGuests(game);
      if (unloaded > 0 || boarded > 0) {
        PT.audio.tractorBell();
      }
      this.status = `Waiting at Stop #${this.stopIdx + 1} (${this.riders.length}/${PT.TRACTOR_DEF.capacity} riders)`;
    }

    unloadRidersAtCurrentStop(game) {
      let unloaded = 0;
      const dropSpot = game.map.findAdjacentWalkable(Math.round(this.wagonX), Math.round(this.wagonY))
        || game.map.findAdjacentWalkable(Math.round(this.x), Math.round(this.y))
        || { x: Math.round(this.x), y: Math.round(this.y) };

      for (let i = this.riders.length - 1; i >= 0; i--) {
        const g = this.riders[i];
        if (g.destStopIdx === this.stopIdx || g.destStopIdx < 0 || g.destStopIdx >= this.stops.length) {
          this.riders.splice(i, 1);
          g.x = dropSpot.x + (Math.random() - 0.5) * 0.35;
          g.y = dropSpot.y + (Math.random() - 0.5) * 0.35;
          g.state = 'browse';
          g.rodeTractor = true;
          g.destStopIdx = -1;
          g.targetStopIdx = -1;
          g.path = [];
          g.timer = 0.45;
          g.visitsDone++;
          g.happiness = Math.min(100, g.happiness + 18);
          g.thought = 'That tractor wagon ride was so much fun!';
          game.spawnSparkles(g.x, g.y, '#ffe678', 5);
          unloaded++;
        }
      }
      return unloaded;
    }

    unloadAllRiders(game) {
      const dropSpot = game.map.findAdjacentWalkable(Math.round(this.wagonX), Math.round(this.wagonY))
        || game.map.findAdjacentWalkable(Math.round(this.x), Math.round(this.y))
        || { x: Math.round(this.x), y: Math.round(this.y) };

      for (const g of this.riders) {
        g.x = dropSpot.x;
        g.y = dropSpot.y;
        g.state = 'browse';
        g.destStopIdx = -1;
        g.targetStopIdx = -1;
        g.path = [];
        g.timer = 0.3;
      }
      this.riders = [];
    }

    boardWaitingGuests(game) {
      if (!this.isReadyForGuests() || this.riders.length >= PT.TRACTOR_DEF.capacity) return 0;
      const stop = this.stops[this.stopIdx];
      if (!stop) return 0;
      let boarded = 0;
      for (const g of game.guests) {
        if (this.riders.length >= PT.TRACTOR_DEF.capacity) break;
        if (g.state === 'waiting_tractor' && g.targetStopIdx === this.stopIdx) {
          if (Math.hypot(g.x - stop.x, g.y - stop.y) <= 2.2) {
            if (this.boardGuest(g, game)) boarded++;
          }
        }
      }
      return boarded;
    }

    boardGuest(g, game) {
      if (!this.isReadyForGuests() || this.riders.length >= PT.TRACTOR_DEF.capacity) return false;
      if (this.riders.includes(g)) return false;

      // Pick a different stop as destination
      const otherStops = [];
      for (let i = 0; i < this.stops.length; i++) {
        if (i !== this.stopIdx && game.map.isTractorDrivable(this.stops[i].x, this.stops[i].y)) {
          otherStops.push(i);
        }
      }
      if (otherStops.length === 0) return false;

      // RCT-style fare fairness check
      const fairPrice = PT.TRACTOR_DEF.defaultPrice;
      if (this.price > fairPrice * 1.5 && fairPrice > 0) {
        g.happiness = Math.max(15, g.happiness - 6);
        g.thought = 'The tractor wagon ride is too expensive!';
        g.state = 'browse';
        g.targetStopIdx = -1;
        return false;
      }

      if (g.cash < this.price) {
        g.state = 'browse';
        g.targetStopIdx = -1;
        return false;
      }

      g.cash -= this.price;
      this.served++;
      if (this.price > 0) {
        this.revenue += this.price;
        game.addCash(this.price, 'stalls', this.x, this.y);
      }

      const destIdx = otherStops[Math.floor(Math.random() * otherStops.length)];
      g.state = 'riding_tractor';
      g.destStopIdx = destIdx;
      g.targetStopIdx = -1;
      g.path = [];
      g.targetTile = null;
      g.x = this.wagonX;
      g.y = this.wagonY;
      g.itemsBought.push('Tractor Ride');
      g.thought = `Riding the hay wagon to Stop #${destIdx + 1}!`;
      this.riders.push(g);
      return true;
    }
  }

  class Boat {
    constructor(dock, guest, mode = 'boat') {
      this.id = nextEntityId++;
      this.kind = 'boat';
      this.mode = mode; // 'boat' (open water) | 'skate' (frozen winter ice)
      this.dock = dock;
      this.guest = guest;
      this.x = dock.x;
      this.y = dock.y;
      this.dirX = 1;
      this.dirY = 0;
      this.paddlePhase = Math.random() * 6;
      this.path = [];
      this.state = 'paddling'; // 'paddling' | 'returning'
      this.rideTimer = PT.BOAT_DEF.rideDuration * (0.82 + Math.random() * 0.42);
      this.pauseTimer = 0;
    }

    update(dt, game) {
      if (!this.guest || !game.guests.includes(this.guest)) return false;

      const isSkate = this.mode === 'skate';
      const frozenNow = this.dock.isFrozen(game);
      const seasonChanged = (isSkate !== frozenNow);

      if (this.state === 'paddling') {
        this.rideTimer -= dt;
        if (this.rideTimer <= 0 || !this.dock.open || seasonChanged) {
          this.state = 'returning';
          this.pauseTimer = 0;
          this.guest.thought = isSkate
            ? 'Skating back to return my ice skates!'
            : 'Paddling back to the boat dock!';
          this.path = game.map.findWaterPath(this.x, this.y, this.dock.x, this.dock.y);
        }
      }

      if (this.path.length > 0) {
        const next = this.path[0];
        const dx = next.x - this.x;
        const dy = next.y - this.y;
        const dist = Math.hypot(dx, dy);
        const speed = isSkate ? PT.BOAT_DEF.skateSpeed : PT.BOAT_DEF.paddleSpeed;

        if (dist > 0.001) {
          this.dirX = dx / dist;
          this.dirY = dy / dist;
        }
        this.paddlePhase += dt * speed * (isSkate ? 4.8 : 3.8);

        if (dist <= speed * dt) {
          this.x = next.x;
          this.y = next.y;
          this.path.shift();
        } else {
          this.x += (dx / dist) * speed * dt;
          this.y += (dy / dist) * speed * dt;
        }

        // Sync guest to pond coordinates & emit wake ripples (water) or frost glints (ice)
        this.guest.x = this.x;
        this.guest.y = this.y;
        if (Math.random() < Math.min(dt, 0.08) * 3.8) {
          game.spawnParticle({
            tx: this.x - this.dirX * 0.25,
            ty: this.y - this.dirY * 0.25,
            vx: -this.dirX * 4 + (Math.random() - 0.5) * 3,
            vy: isSkate ? (-6 - Math.random() * 6) : (-2 + (Math.random() - 0.5) * 2),
            px: 0,
            py: -2,
            color: isSkate ? 'rgba(242, 250, 255, 0.88)' : 'rgba(220, 246, 255, 0.72)',
            size: 2,
            age: 0,
            life: isSkate ? 0.5 : 0.65
          });
        }
        return true;
      }

      // Reached end of current pond path
      if (this.state === 'returning') {
        if (Math.hypot(this.x - this.dock.x, this.y - this.dock.y) <= 0.45) {
          return false; // Returned to dock! BoatDock will disembark the guest.
        }
        this.path = game.map.findWaterPath(this.x, this.y, this.dock.x, this.dock.y);
        if (this.path.length === 0) return false;
        return true;
      }

      // Briefly pause/glide on the pond, then head to another scenic spot!
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
        this.guest.x = this.x;
        this.guest.y = this.y;
        return true;
      }

      const pool = game.map.getConnectedWaterTiles(this.dock.x, this.dock.y);
      const others = pool.filter(t => t.x !== Math.round(this.x) || t.y !== Math.round(this.y));
      if (others.length === 0) {
        this.state = 'returning';
        return true;
      }
      let target = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const cand = others[Math.floor(Math.random() * others.length)];
        if (!target || Math.hypot(cand.x - this.x, cand.y - this.y) >= 2.0) {
          target = cand;
          if (Math.hypot(cand.x - this.x, cand.y - this.y) >= 2.0) break;
        }
      }
      if (target) {
        const p = game.map.findWaterPath(this.x, this.y, target.x, target.y);
        if (p.length > 0) {
          this.path = p;
          this.pauseTimer = isSkate ? (0.25 + Math.random() * 0.45) : (0.5 + Math.random() * 0.7);
          return true;
        }
      }
      this.pauseTimer = 0.8;
      return true;
    }
  }

  class BoatDock {
    constructor(x, y) {
      this.id = nextEntityId++;
      this.kind = 'boat_dock';
      this.name = PT.BOAT_DEF.name;
      this.x = x;
      this.y = y;
      this.open = true;
      this.price = PT.BOAT_DEF.defaultPrice;
      this.revenue = 0;
      this.served = 0;
      this.boats = [];
      this.status = 'Open — Ready for boaters';
    }

    isFrozen(game) {
      return !!(game && game.isWinterVisual());
    }

    getCapacity(game) {
      return this.isFrozen(game) ? PT.BOAT_DEF.maxSkaters : PT.BOAT_DEF.maxBoats;
    }

    isReadyForGuests(game = null) {
      const cap = game ? this.getCapacity(game) : PT.BOAT_DEF.maxBoats;
      return this.open && this.boats.length < cap;
    }

    launchBoatForGuest(g, game) {
      if (!this.isReadyForGuests(game)) return false;
      const frozen = this.isFrozen(game);
      const fairPrice = PT.BOAT_DEF.defaultPrice;
      if (this.price > fairPrice * 1.5 && fairPrice > 0) {
        g.happiness = Math.max(15, g.happiness - 6);
        g.thought = frozen ? 'Ice skate rentals are way too pricey!' : 'Boat rentals are way too pricey!';
        return false;
      }
      if (g.cash < this.price) return false;

      g.cash -= this.price;
      this.served++;
      if (this.price > 0) {
        this.revenue += this.price;
        game.addCash(this.price, 'stalls', this.x, this.y);
      }

      const mode = frozen ? 'skate' : 'boat';
      const boat = new Boat(this, g, mode);
      this.boats.push(boat);
      g.state = 'paddling_boat';
      g.boat = boat;
      g.path = [];
      g.targetTile = null;
      g.x = this.x;
      g.y = this.y;
      if (frozen) {
        g.itemsBought.push('Ice Skate Rental');
        g.thought = 'Gliding across the frozen pond—wheee!';
        PT.audio.skate();
      } else {
        g.itemsBought.push('Boat Rental');
        g.thought = 'Paddling around the pond—this is so peaceful!';
        PT.audio.splash();
      }
      return true;
    }

    disembarkGuest(g, game, happyBonus = true, mode = 'boat') {
      const shore = game.map.findAdjacentWalkable(this.x, this.y) || game.map.entrance;
      g.x = shore.x + (Math.random() - 0.5) * 0.3;
      g.y = shore.y + (Math.random() - 0.5) * 0.3;
      g.boat = null;
      g.state = 'browse';
      g.path = [];
      g.timer = 0.45;
      if (happyBonus) {
        const isSkate = mode === 'skate';
        g.rodeBoat = true;
        g.visitsDone++;
        g.happiness = Math.min(100, g.happiness + (isSkate ? 20 : 18));
        g.thought = isSkate
          ? 'Ice skating on the frozen pond was magical!'
          : 'What a relaxing paddle around the pond!';
        game.spawnSparkles(g.x, g.y, isSkate ? '#e8f7ff' : '#9ee6ff', 5);
        if (isSkate) PT.audio.skate();
        else PT.audio.splash();
      }
    }

    disembarkAll(game) {
      for (const b of this.boats) {
        if (b.guest && game.guests.includes(b.guest)) {
          this.disembarkGuest(b.guest, game, false, b.mode);
        }
      }
      this.boats = [];
    }

    update(dt, game) {
      for (let i = this.boats.length - 1; i >= 0; i--) {
        const b = this.boats[i];
        const alive = b.update(dt, game);
        if (!alive) {
          this.boats.splice(i, 1);
          if (b.guest && game.guests.includes(b.guest)) {
            this.disembarkGuest(b.guest, game, true, b.mode);
          }
        }
      }

      const frozen = this.isFrozen(game);
      const cap = this.getCapacity(game);
      const noun = frozen ? 'skater' : 'boat';
      const plural = this.boats.length === 1 ? '' : 's';
      if (!this.open) {
        this.status = this.boats.length > 0
          ? `Closed (${this.boats.length} ${noun}${plural} returning)`
          : 'Dock closed';
      } else if (this.boats.length > 0) {
        this.status = frozen
          ? `⛸️ ${this.boats.length}/${cap} ${noun}${plural} gliding on ice`
          : `🚣 ${this.boats.length}/${cap} ${noun}${plural} paddling on pond`;
      } else {
        this.status = frozen
          ? '⛸️ Frozen Pond — Open for Ice Skating!'
          : '🚣 Open — Ready for Rowboats';
      }
    }
  }

  PT.Guest = Guest;
  PT.Staff = Staff;
  PT.Tractor = Tractor;
  PT.Boat = Boat;
  PT.BoatDock = BoatDock;
})();
