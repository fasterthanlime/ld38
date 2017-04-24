
import * as ex from "excalibur";

import {resolve} from "path";
import glob from "./glob";
import * as TWEEN from "tween.js";

import constants from "./constants";
import maps from "./maps";
import {MapSpec, parseMap} from "./parse-map";
import {updateMap} from "./update-map";
import * as random from "./random";

function resourcePath(inPath: string) {
  return `file://${resolve(__dirname, "..", inPath)}`;
}

enum Dir {
  Up,
  Left,
  Down,
  Right,
}

function dirToDelta(dir: Dir): number[] {
  switch (dir) {
    case Dir.Up:
      return [0, -1];
    case Dir.Left:
      return [-1, 0];
    case Dir.Down:
      return [0, 1];
    case Dir.Right:
      return [1, 0];
  }
}

function dirToString(dir: Dir): string {
  switch (dir) {
    case Dir.Up:
      return "up";
    case Dir.Left:
      return "left";
    case Dir.Down:
      return "down";
    case Dir.Right:
      return "right";
  }
}

interface IAnims {
  [key: string]: ex.Animation;
}

interface IXY {
  x: number;
  y: number;
}

class Tweener extends ex.Actor {
  update(engine, delta) {
    TWEEN.update();
  }
}

class Decay extends ex.Actor {
  time = 0;

  constructor(
      public tilemap: ex.TileMap,
      public sheet: ex.SpriteSheet,
      public mapSpec: MapSpec,
  ) {
    super();
  }

  update(engine, delta) {
    this.time += delta;

    if (this.time > 250) {
      this.time = 0;
      ex.Logger.getInstance().info("Updating map!");
      const row = random.within(0, constants.mapRows);
      const col = random.within(0, constants.mapCols);
      this.mapSpec[row][col] = random.pick(["0", "1", "2", "3", "4"]);

      updateMap(this.tilemap, this.sheet, this.mapSpec);
    }
  }
}

enum PlayerState {
  Idle,
  Rest,
  Walk,
}

function playerStateToAnim(ps: PlayerState): string {
  switch (ps) {
    case PlayerState.Idle: return "idle";
    case PlayerState.Rest: return "idle";
    case PlayerState.Walk: return "walk";
  }
}

class Player extends ex.Actor {
  state = PlayerState.Idle;
  dir = Dir.Right;
  colRow = new ex.Vector(1, 1);
  sprite: ex.Sprite;
  anims: IAnims;
  tilemap: ex.TileMap;
  restTime = 0;

  constructor(tilemap: ex.TileMap) {
    super();
    this.tilemap = tilemap;
    this.updatePos();
  }

  async load(engine: ex.Engine) {
    const sokoTex = new ex.Texture(resourcePath("images/sokoban_tilesheet.png"));
    await sokoTex.load();

    const cellSide = 64;  
    const sheet = new ex.SpriteSheet(
      sokoTex,
      sokoTex.width / cellSide, sokoTex.height / cellSide,
      cellSide, cellSide,
    );

    const tileIndex = ({x, y}): number => {
      return x + y * sheet.columns;
    };

    this.anims = {};
    const loadAnim = (name: string, xys: IXY[]) => {
      const anim = sheet.getAnimationByIndices(
        engine,
        xys.map(tileIndex),
        200,
      );
      anim.loop = true;
      this.anims[name] = anim;
      this.addDrawing(name, this.anims[name]);
    };

    loadAnim("idle-down", [
      { x: 0, y: 5 },
    ]);
    loadAnim("walk-down", [
      { x: 1, y: 5 },
      { x: 0, y: 5 },
      { x: 2, y: 5 },
      { x: 0, y: 5 },
    ]);
    loadAnim("idle-up", [
      { x: 3, y: 5 },
    ]);
    loadAnim("walk-up", [
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 5, y: 5 },
      { x: 3, y: 5 },
    ]);

    loadAnim("idle-right", [
      { x: 0, y: 7 },
    ]);
    loadAnim("walk-right", [
      { x: 1, y: 7 },
      { x: 0, y: 7 },
      { x: 2, y: 7 },
      { x: 0, y: 7 },
    ]);
    loadAnim("idle-left", [
      { x: 3, y: 7 },
    ]);
    loadAnim("walk-left", [
      { x: 4, y: 7 },
      { x: 3, y: 7 },
      { x: 5, y: 7 },
      { x: 3, y: 7 },
    ]);

    this.updateAnim();
  }

  update(engine, delta) {
    switch (this.state) {
      case PlayerState.Walk:
        // muffin
        break;
      case PlayerState.Rest:
        // don't handle inputs when resting
        this.restTime -= delta;
        if (this.restTime <= 0) {
          this.state = PlayerState.Idle;
        }
        break;
      case PlayerState.Idle:
        this.handleInputs(engine);
        break;
    }
  }

  handleInputs(engine: ex.Engine) {
    if (engine.input.keyboard.isHeld(ex.Input.Keys.W)) {
      this.walk(Dir.Up);
    } else if (engine.input.keyboard.isHeld(ex.Input.Keys.A)) {
      this.walk(Dir.Left);
    } else if (engine.input.keyboard.isHeld(ex.Input.Keys.S)) {
      this.walk(Dir.Down);
    } else if (engine.input.keyboard.isHeld(ex.Input.Keys.D)) {
      this.walk(Dir.Right);
    }
  }

  walk(dir: Dir) {
    const [dx, dy] = dirToDelta(dir);
    this.dir = dir;

    const cell = this.tilemap.getCell(
      Math.round(this.colRow.x + dx),
      Math.round(this.colRow.y + dy),
    );
    if (cell && cell.solid) {
      const far = {
        x: this.colRow.x + .1 * dx,
        y: this.colRow.y + .1 * dy,
      };
      const near = {
        x: Math.round(this.colRow.x),
        y: Math.round(this.colRow.y),
      };

      this.state = PlayerState.Walk;
      const forth = new TWEEN.Tween(this.colRow).to(far, 100).onUpdate(() => {
        this.updatePos();
      });
      
      const back = new TWEEN.Tween(this.colRow).to(near, 100).onUpdate(() => {
        this.updatePos();
      }).onComplete(() => {
        this.state = PlayerState.Rest;
        this.restTime = 200;
        this.updateAnim();
      });
      
      forth.chain(back).start();

      this.updateAnim();
      this.emit("walked");
      return;
    }

    this.state = PlayerState.Walk;
    this.updateAnim();
    new TWEEN.Tween(this.colRow).to({
      x: this.colRow.x + dx, y: this.colRow.y + dy,
    }, 400).onUpdate(() => {
      this.updatePos();
    }).onComplete(() => {
      this.state = PlayerState.Idle;
      this.updateAnim();
    }).start();

    this.emit("walked");
  }

  playAnim(animName: string, play = true) {
    const log = ex.Logger.getInstance();
    const anim = this.anims[animName];
    if (anim) {
      this.setDrawing(animName);
    } else {
      log.warn(`couldn't find ${animName}`);
    }
  }

  updatePos() {
    this.pos.x = (.5 + this.colRow.x) * constants.cellWidth;
    this.pos.y = (.5 + this.colRow.y) * constants.cellHeight;
  }

  updateAnim() {
    this.playAnim(`${playerStateToAnim(this.state)}-${dirToString(this.dir)}`);
  }
}

function boot() {
  startGame().then(() => {
    // yay
  }).catch((e) => {
    console.error("Top-level game error: ", e);
  });
}

async function startGame() {
  const game = new ex.Engine({
    width: constants.windowWidth,
    height: constants.windowHeight,
    canvasElementId: "game",
  });

  const log = ex.Logger.getInstance();
  log.info("Loading sounds...");

  const walkSounds = [];
  const walkSoundPaths = await glob("sounds/walk*.wav");
  for (const walkSoundPath of walkSoundPaths) {
    const urlPath = resourcePath(walkSoundPath);
    log.info("Found sound " + urlPath);
    const sound = new ex.Sound(urlPath);
    await sound.load();
    sound.setVolume(.4);
    walkSounds.push(sound);
  }

  game.backgroundColor = new ex.Color(.83, .82, .71);

  const sokoTex = new ex.Texture(resourcePath("images/sokoban_tilesheet.png"));
  await sokoTex.load();

  const cellSide = 64;  
  const sheet = new ex.SpriteSheet(
    sokoTex,
    sokoTex.width / cellSide, sokoTex.height / cellSide,
    cellSide, cellSide,
  );

  const cellIndex = ({x, y}): number => {
    return x + y * constants.mapCols;
  };

  const tilemap = new ex.TileMap(
    0, 0, 
    constants.cellWidth, constants.cellHeight,
    constants.mapRows, constants.mapCols,
  );
  tilemap.registerSpriteSheet("main", sheet);

  const mapSpec = parseMap(maps.start);
  updateMap(tilemap, sheet, mapSpec);
  game.add(tilemap);

  const player = new Player(tilemap);
  game.add(player);

  player.on("walked", () => {
    const index = Math.floor(Math.random() * (walkSounds.length - 1));
    walkSounds[index].play();
  });
  await player.load(game);

  game.add(new Tweener());

  game.add(new Decay(tilemap, sheet, mapSpec));

  game.start();
}

document.addEventListener("DOMContentLoaded", boot);
