import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();
let connected = false;
const eventCallbacks = {};

// Single reconnect chain: listeners are registered once (re-registering on
// every reconnect would stack handlers — N reconnects would fire media-end
// events N times and spawn N parallel retry loops), and only one retry timer
// can be pending at a time.
let listenersRegistered = false;
let reconnectTimer = null;
let lastConn = { host: 'localhost', port: 4455, password: '' };

// Fired after every SUCCESSFUL identification — the boot connect and every
// scheduleReconnect() retry alike (retries go through connect()). Consumers use
// it to re-push state and re-heal browser sources, which is what makes
// "start the app, then start OBS" work without a restart.
const connectHandlers = [];

/** Register a callback to run each time OBS connects (or reconnects). */
export function onConnected(fn) {
  if (typeof fn === 'function') connectHandlers.push(fn);
}

function fireConnected() {
  for (const fn of connectHandlers) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch(e => console.error('[OBS] onConnected handler failed:', e.message));
    } catch (e) {
      console.error('[OBS] onConnected handler failed:', e.message);
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!connected) connect(lastConn.host, lastConn.port, lastConn.password);
  }, 5000);
}

function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  obs.on('ConnectionClosed', () => {
    if (!connected) return; // closed during a failed connect attempt — failure path retries
    connected = false;
    console.log('[OBS] Disconnected');
    scheduleReconnect();
  });

  // Forward media events for replay auto-cycling
  obs.on('MediaInputPlaybackEnded', (data) => {
    if (eventCallbacks.onMediaEnd) eventCallbacks.onMediaEnd(data);
  });

  // Forward scene-collection switches (fires when the producer imports and
  // switches to a new collection). Importing REPLACES every media source
  // with the JSON's blank-path version, so the server must clear its sync
  // cache and re-push media paths — otherwise the change-guarded sync
  // believes everything is already set and the show goes silent (producer
  // bug report, post-v2.0.0: "imported the JSON and it broke all the music
  // and cinematics").
  obs.on('CurrentSceneCollectionChanged', (data) => {
    if (eventCallbacks.onCollectionChanged) eventCallbacks.onCollectionChanged(data);
  });
}

export async function connect(host = 'localhost', port = 4455, password = '') {
  lastConn = { host, port, password };
  // A manual connect supersedes any pending auto-retry
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    const url = `ws://${host}:${port}`;
    await obs.connect(url, password || undefined);
    connected = true;
    console.log('[OBS] Connected to', url);
    registerListeners();
    fireConnected();
    return { connected: true };
  } catch (e) {
    connected = false;
    console.warn('[OBS] Connection failed:', e.message);
    scheduleReconnect();
    return { connected: false, error: e.message };
  }
}

export function isConnected() {
  return connected;
}

export function onEvent(eventName, callback) {
  eventCallbacks[eventName] = callback;
}



export async function getScenes() {
  // Same shape connected or not — callers do `d.scenes || []` on the JSON.
  if (!connected) return { scenes: [], currentScene: '' };
  try {
    const { scenes, currentProgramSceneName } = await obs.call('GetSceneList');
    return { scenes: scenes.reverse(), currentScene: currentProgramSceneName };
  } catch (e) {
    console.error('[OBS] GetSceneList error:', e.message);
    return { scenes: [], currentScene: '' };
  }
}

export async function setScene(sceneName) {
  if (!connected) return false;
  try {
    await obs.call('SetCurrentProgramScene', { sceneName });
    return true;
  } catch (e) {
    console.error('[OBS] SetScene error:', e.message);
    return false;
  }
}

export async function setTextSource(sourceName, text) {
  if (!connected) return false;
  try {
    await obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: { text },
    });
    return true;
  } catch (e) {
    console.error('[OBS] SetTextSource error:', e.message);
    return false;
  }
}

export async function setTextFont(sourceName, fontFace, fontSize = 256) {
  if (!connected) return false;
  try {
    await obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: {
        font: { face: fontFace, style: 'Regular', size: fontSize, flags: 0 },
      },
    });
    return true;
  } catch (e) {
    console.error('[OBS] SetTextFont error:', e.message);
    return false;
  }
}

export async function setCurrentSceneTransition(transitionName, duration = 500) {
  if (!connected) return false;
  try {
    await obs.call('SetCurrentSceneTransition', { transitionName });
    if (duration) {
      await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: duration });
    }
    return true;
  } catch (e) {
    console.error('[OBS] SetTransition error:', e.message);
    return false;
  }
}

// Create a new input and add it to a scene
export async function createInput(sceneName, inputName, inputKind, inputSettings = {}) {
  if (!connected) return null;
  try {
    const result = await obs.call('CreateInput', {
      sceneName, inputName, inputKind, inputSettings,
      sceneItemEnabled: true,
    });
    return result.sceneItemId;
  } catch (e) {
    if (e.message?.includes('already exists')) return -1;
    console.error('[OBS] CreateInput error:', e.message);
    return null;
  }
}

// Raw OBS call for anything not covered by helper functions
export async function rawCall(requestType, requestData) {
  if (!connected) return null;
  try {
    return await obs.call(requestType, requestData);
  } catch (e) {
    console.error(`[OBS] ${requestType} error:`, e.message);
    return null;
  }
}

export async function setImageSource(sourceName, filePath) {
  if (!connected) return false;
  try {
    await obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: { file: filePath },
    });
    return true;
  } catch (e) {
    console.error('[OBS] SetImageSource error:', e.message);
    return false;
  }
}

export async function setMediaSource(sourceName, filePath, loop = true) {
  if (!connected) return false;
  try {
    await obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: {
        local_file: filePath,
        looping: loop,
        restart_on_activate: false,
      },
    });
    // Restart playback from the beginning
    await obs.call('TriggerMediaInputAction', {
      inputName: sourceName,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    }).catch(() => {});
    return true;
  } catch (e) {
    console.error('[OBS] SetMediaSource error:', e.message);
    return false;
  }
}

export async function stopMediaSource(sourceName) {
  if (!connected) return false;
  try {
    await obs.call('TriggerMediaInputAction', {
      inputName: sourceName,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
    });
    return true;
  } catch (e) {
    console.error('[OBS] StopMediaSource error:', e.message);
    return false;
  }
}

export async function setBrowserSource(sourceName, url) {
  if (!connected) return false;
  try {
    await obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: { url },
    });
    return true;
  } catch (e) {
    console.error('[OBS] SetBrowserSource error:', e.message);
    return false;
  }
}

export async function setSourceVisibility(sceneName, sourceName, visible) {
  if (!connected) return false;
  try {
    const { sceneItemId } = await obs.call('GetSceneItemId', {
      sceneName,
      sourceName,
    });
    await obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId,
      sceneItemEnabled: visible,
    });
    return true;
  } catch (e) {
    console.error('[OBS] SetSourceVisibility error:', e.message);
    return false;
  }
}

export async function getInputList() {
  if (!connected) return [];
  try {
    const { inputs } = await obs.call('GetInputList');
    return inputs;
  } catch (e) {
    console.error('[OBS] GetInputList error:', e.message);
    return [];
  }
}

/** Get scene item list for a given scene */
export async function getSceneItemList(sceneName) {
  if (!connected) return [];
  try {
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
    return sceneItems;
  } catch (e) {
    console.error('[OBS] GetSceneItemList error:', e.message);
    return [];
  }
}

export async function refreshBrowserSource(sourceName) {
  if (!connected) return false;
  try {
    await obs.call('PressInputPropertiesButton', {
      inputName: sourceName,
      propertyName: 'refreshnocache',
    });
    return true;
  } catch (e) {
    console.error('[OBS] RefreshBrowserSource error:', e.message);
    return false;
  }
}

export async function getSourceScreenshot(sourceName, width = 1920, height = 1080) {
  if (!connected) return null;
  try {
    const { imageData } = await obs.call('GetSourceScreenshot', {
      sourceName,
      imageFormat: 'png',
      imageWidth: width,
      imageHeight: height,
    });
    return imageData; // base64 data URI: "data:image/png;base64,..."
  } catch (e) {
    console.error('[OBS] GetSourceScreenshot error:', e.message);
    return null;
  }
}

export async function getCurrentProgramScene() {
  if (!connected) return null;
  try {
    const { currentProgramSceneName } = await obs.call('GetCurrentProgramScene');
    return currentProgramSceneName;
  } catch (e) {
    console.error('[OBS] GetCurrentProgramScene error:', e.message);
    return null;
  }
}

export async function getSceneItemTransform(sceneName, sourceName) {
  if (!connected) return null;
  try {
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName });
    const { sceneItemTransform } = await obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
    return { sceneItemId, ...sceneItemTransform };
  } catch (e) {
    console.error('[OBS] GetSceneItemTransform error:', e.message);
    return null;
  }
}

export async function setSceneItemTransform(sceneName, sourceName, transform) {
  if (!connected) return false;
  try {
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName });
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: transform,
    });
    return true;
  } catch (e) {
    console.error('[OBS] SetSceneItemTransform error:', e.message);
    return false;
  }
}


export async function getInputVolume(inputName) {
  if (!connected) return null;
  try {
    const result = await obs.call('GetInputVolume', { inputName });
    return { inputVolumeDb: result.inputVolumeDb, inputVolumeMul: result.inputVolumeMul };
  } catch (e) {
    console.error('[OBS] GetInputVolume error:', e.message);
    return null;
  }
}

export async function setInputVolume(inputName, volumeDb) {
  if (!connected) return false;
  try {
    await obs.call('SetInputVolume', { inputName, inputVolumeDb: volumeDb });
    return true;
  } catch (e) {
    console.error('[OBS] SetInputVolume error:', e.message);
    return false;
  }
}

export async function getInputMute(inputName) {
  if (!connected) return null;
  try {
    const { inputMuted } = await obs.call('GetInputMute', { inputName });
    return inputMuted;
  } catch (e) {
    console.error('[OBS] GetInputMute error:', e.message);
    return null;
  }
}

export async function setInputMute(inputName, muted) {
  if (!connected) return false;
  try {
    await obs.call('SetInputMute', { inputName, inputMuted: muted });
    return true;
  } catch (e) {
    console.error('[OBS] SetInputMute error:', e.message);
    return false;
  }
}

// ============ REPLAY BUFFER ============

export async function getReplayBufferStatus() {
  if (!connected) return { active: false };
  try {
    const result = await obs.call('GetReplayBufferStatus');
    return { active: result.outputActive };
  } catch (e) {
    // Replay buffer not configured
    return { active: false, error: e.message };
  }
}

export async function startReplayBuffer() {
  if (!connected) return false;
  try {
    await obs.call('StartReplayBuffer');
    return true;
  } catch (e) {
    console.error('[OBS] StartReplayBuffer error:', e.message);
    return false;
  }
}

export async function stopReplayBuffer() {
  if (!connected) return false;
  try {
    await obs.call('StopReplayBuffer');
    return true;
  } catch (e) {
    console.error('[OBS] StopReplayBuffer error:', e.message);
    return false;
  }
}

export async function saveReplayBuffer() {
  if (!connected) return null;
  try {
    await obs.call('SaveReplayBuffer');
    // OBS saves async, give it a moment
    await new Promise(r => setTimeout(r, 500));
    const result = await obs.call('GetLastReplayBufferReplay');
    return result.savedReplayPath || null;
  } catch (e) {
    console.error('[OBS] SaveReplayBuffer error:', e.message);
    return null;
  }
}

export async function getLastReplayPath() {
  if (!connected) return null;
  try {
    const result = await obs.call('GetLastReplayBufferReplay');
    return result.savedReplayPath || null;
  } catch (e) {
    return null;
  }
}

export default obs;
