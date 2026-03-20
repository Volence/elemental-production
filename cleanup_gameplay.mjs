// Refresh Gameplay HUD browser source and clean up scene
import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();

async function main() {
  await obs.connect('ws://localhost:4455', 'coolpoop');
  console.log('Connected to OBS');

  // Refresh the browser source to load updated HTML
  try {
    await obs.call('PressInputPropertiesButton', {
      inputName: 'Gameplay HUD BS',
      propertyName: 'refreshnocache',
    });
    console.log('Refreshed Gameplay HUD BS');
  } catch (e) {
    // Fallback: set the URL again to force reload
    try {
      await obs.call('SetInputSettings', {
        inputName: 'Gameplay HUD BS',
        inputSettings: {
          url: 'http://localhost:3001/overlays/gameplay-hud.html',
          width: 1920,
          height: 1080,
        },
      });
      console.log('Reset Gameplay HUD BS URL');
    } catch (e2) {
      console.error('Could not refresh:', e2.message);
    }
  }

  // List current Gameplay scene items
  const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: 'Gameplay' });
  console.log('\nCurrent Gameplay items:');
  for (const item of sceneItems) {
    console.log(`  idx:${item.sceneItemIndex} "${item.sourceName}" id:${item.sceneItemId}`);
  }

  // Remove redundant text/image sources from Gameplay
  // Keep only: Gameplay HUD BS and Observer BS
  const keep = ['Gameplay HUD BS', 'Observer BS'];
  for (const item of sceneItems) {
    if (!keep.includes(item.sourceName)) {
      try {
        await obs.call('RemoveSceneItem', {
          sceneName: 'Gameplay',
          sceneItemId: item.sceneItemId,
        });
        console.log(`Removed "${item.sourceName}" from Gameplay scene`);
      } catch (e) {
        console.error(`Failed to remove "${item.sourceName}": ${e.message}`);
      }
    }
  }

  // Verify
  const { sceneItems: after } = await obs.call('GetSceneItemList', { sceneName: 'Gameplay' });
  console.log('\nGameplay scene after cleanup:');
  for (const item of after) {
    console.log(`  idx:${item.sceneItemIndex} "${item.sourceName}"`);
  }

  // Make sure HUD is on top, Observer at back
  for (const item of after) {
    if (item.sourceName === 'Gameplay HUD BS') {
      await obs.call('SetSceneItemIndex', {
        sceneName: 'Gameplay',
        sceneItemId: item.sceneItemId,
        sceneItemIndex: after.length - 1, // front
      });
    }
    if (item.sourceName === 'Observer BS') {
      await obs.call('SetSceneItemIndex', {
        sceneName: 'Gameplay',
        sceneItemId: item.sceneItemId,
        sceneItemIndex: 0, // back
      });
    }
  }

  console.log('\nDone! Gameplay scene now uses only the browser overlay for team bars.');
  await obs.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
