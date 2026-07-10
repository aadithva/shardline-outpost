import "./styles.css";
import { AssetLibrary } from "./game/AssetLibrary.js";
import { Game } from "./game/Game.js";

const viewport = document.querySelector("#viewport");
const startButton = document.querySelector("#start-button");
const loadingStatus = document.querySelector("#loading-status");
const assets = new AssetLibrary();

startButton.disabled = true;
startButton.querySelector("span").textContent = "LOADING FIELD KIT";

try {
  await assets.load(({ loaded, total }) => {
    loadingStatus.textContent = `Loading local 3D assets · ${loaded}/${total}`;
  });

  const game = new Game(viewport, assets);
  window.__game = game;
  startButton.disabled = false;
  startButton.querySelector("span").textContent = "ENTER SKYWATCH";
  loadingStatus.textContent = "CC0 models loaded locally · Headphones recommended · ESC releases cursor";
  game.run();
} catch (error) {
  loadingStatus.textContent = "Asset loading failed. Check the local server console.";
  startButton.querySelector("span").textContent = "LOAD FAILED";
  console.error(error);
  throw error;
}
