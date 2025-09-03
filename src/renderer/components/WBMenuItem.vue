<!--
  WBMenuItem - Replacement for broken xel menuitem component
  This is a working reimplementation of the xel toolkit's x-menuitem component
  which has bugs in the library that prevent proper functionality.
-->
<template>
  <div
    class="wb-menuitem"
    :class="{ 'wb-menuitem--disabled': disabled }"
    @click="handleClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isHovered = ref(false)

const handleClick = (event: MouseEvent) => {
  if (props.disabled) return

  emit('click', event)
}
</script>

<style scoped>
.wb-menuitem {
  padding: var(--x-menuitem-padding, 8px 16px);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.15s ease;
  font-size: var(--x-menuitem-font-size, 14px);
  line-height: 1.4;
}

.wb-menuitem:hover:not(.wb-menuitem--disabled) {
  background-color: var(--x-menuitem-hover-background, #f0f0f0);
}

.wb-menuitem--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .wb-menuitem:hover:not(.wb-menuitem--disabled) {
    background-color: var(--x-menuitem-hover-background-dark, #404040);
  }
}

/* Match xel theming if available */
:global(.x-theme-material) .wb-menuitem:hover:not(.wb-menuitem--disabled) {
  background-color: var(--x-surface-variant-background, #f5f5f5);
}

:global(.x-theme-material.x-theme-dark) .wb-menuitem:hover:not(.wb-menuitem--disabled) {
  background-color: var(--x-surface-variant-background, #2a2a2a);
}
</style>
