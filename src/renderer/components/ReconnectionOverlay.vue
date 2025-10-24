<template>
  <Transition name="fade">
    <div v-if="isReconnecting" class="reconnection-overlay">
      <div class="reconnection-content">
        <div class="spinner"></div>
        <h2>Reconnecting...</h2>
        <p v-if="reconnectingApp">{{ reconnectingApp }}</p>
        <p class="attempt-counter" v-if="attemptCount > 1">
          Attempt {{ attemptCount }} of {{ maxAttempts }}
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Winboat } from '../lib/winboat';

const winboat = new Winboat();
const isReconnecting = ref(false);
const reconnectingApp = ref<string | null>(null);
const attemptCount = ref(0);
const maxAttempts = ref(5);
const checkInterval = ref<NodeJS.Timeout | null>(null);

// Check for disconnected windows periodically
const checkReconnectionStatus = () => {
  if (!winboat.windowStateMgr) return;

  const disconnectedWindows = winboat.windowStateMgr.getDisconnectedWindows();

  if (disconnectedWindows.length > 0) {
    isReconnecting.value = true;
    const firstWindow = disconnectedWindows[0];
    reconnectingApp.value = firstWindow.appName;
    attemptCount.value = firstWindow.reconnectAttempts;
    maxAttempts.value = firstWindow.maxReconnectAttempts;
  } else {
    isReconnecting.value = false;
    reconnectingApp.value = null;
    attemptCount.value = 0;
  }
};

onMounted(() => {
  // Check every 500ms for reconnection status
  checkInterval.value = setInterval(checkReconnectionStatus, 500);
});

onUnmounted(() => {
  if (checkInterval.value) {
    clearInterval(checkInterval.value);
  }
});
</script>

<style scoped>
.reconnection-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  pointer-events: none;
}

.reconnection-content {
  text-align: center;
  color: white;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  min-width: 300px;
}

.spinner {
  width: 50px;
  height: 50px;
  margin: 0 auto 1rem;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-top-color: #4a9eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
}

p {
  margin: 0.5rem 0;
  opacity: 0.8;
  font-size: 0.95rem;
}

.attempt-counter {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #4a9eff;
  font-weight: 500;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
