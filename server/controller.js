import { Gpio } from 'onoff';

const RELAY_PIN = parseInt(process.env.RELAY_GPIO_PIN || '17');
const UNLOCK_DURATION = 8000;

let relay;
let unlockTimer = null;

export function initGPIO() {
  try {
    relay = new Gpio(RELAY_PIN, 'out');
    relay.writeSync(0);
    console.log(`GPIO initialized on pin ${RELAY_PIN}`);
  } catch (error) {
    console.warn('GPIO not available (probably not running on Raspberry Pi):', error.message);
    relay = null;
  }
}

export function unlockDoor() {
  return new Promise((resolve, reject) => {
    if (!relay) {
      console.log('GPIO not available, simulating door unlock');
      resolve({ simulated: true });
      return;
    }

    try {
      // Clear any existing timer
      if (unlockTimer) {
        clearTimeout(unlockTimer);
      }

      // Unlock the door (activate relay)
      relay.writeSync(1);
      console.log('Door unlocked');

      // Set timer to lock again
      unlockTimer = setTimeout(() => {
        relay.writeSync(0);
        console.log('Door locked');
        unlockTimer = null;
      }, UNLOCK_DURATION);

      resolve({ success: true, duration: UNLOCK_DURATION });
    } catch (error) {
      reject(error);
    }
  });
}

export function lockDoor() {
  if (!relay) {
    console.log('GPIO not available, simulating door lock');
    return { simulated: true };
  }

  if (unlockTimer) {
    clearTimeout(unlockTimer);
    unlockTimer = null;
  }

  relay.writeSync(0);
  console.log('Door locked manually');
  return { success: true };
}

export function getDoorStatus() {
  if (!relay) {
    return { available: false, locked: true };
  }

  return {
    available: true,
    locked: relay.readSync() === 0,
    autoLockActive: unlockTimer !== null
  };
}

// Cleanup on exit
process.on('SIGINT', () => {
  if (relay) {
    relay.writeSync(0);
    relay.unexport();
  }
  process.exit();
});
