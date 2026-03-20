import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();
let connected = false;

export async function connect(host = 'localhost', port = 4455, password = '') {
  try {
    const url = `ws://${host}:${port}`;
    await obs.connect(url, password || undefined);
    connected = true;
    console.log('[OBS] Connected to', url);

    obs.on('ConnectionClosed', () => {
      connected = false;
      console.log('[OBS] Disconnected');
      // Auto-reconnect after 5s
      setTimeout(() => connect(host, port, password), 5000);
    });

    return { connected: true };
  } catch (e) {
    connected = false;
    console.warn('[OBS] Connection failed:', e.message);
    return { connected: false, error: e.message };
  }
}

export function isConnected() {
  return connected;
}

export async function getScenes() {
  if (!connected) return [];
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

export default obs;
