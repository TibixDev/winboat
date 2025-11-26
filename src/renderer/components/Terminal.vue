<template>
  <div class="terminal-outer">
    <div class="terminal-container">
      <div ref="terminalElement" class="terminal-wrapper"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const terminalElement = ref<HTMLDivElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;

onMounted(() => {
  if (!terminalElement.value) return;

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      foreground: 'white',
      background: 'rgb(38 38 38)',
    },
    disableStdin: true,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(terminalElement.value);

  fitAddon.fit();

  terminal.onData((data) => {
    terminal?.write(data);
  });
});

onUnmounted(() => {
  terminal?.dispose();
});

defineExpose({
  write: (data: string) => terminal?.write(data),
  writeln: (data: string) => terminal?.writeln(data),
});
</script>
<style scoped>
  .terminal-container {
    width: 100%;
    height: 100%;
  }
  .terminal-outer {
    background-color: rgb(38, 38, 38);
    border-radius: 8px;
    padding: 14px;
  }
</style>