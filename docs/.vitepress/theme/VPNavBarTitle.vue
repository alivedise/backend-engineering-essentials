<template>
  <div class="bep-nav-container" v-if="hasSidebar">
    <div>
      <div class="bep-nav-hero">
        BEP
      </div>
      <span class="nav-sub">Backend Engineering Principles</span>
    </div>
  </div>
</template>

<script setup>
import { useSidebar } from 'vitepress/theme';
const { hasSidebar } = useSidebar();
</script>

<style>
.bep-nav-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 15px 0;
}
.bep-nav-hero {
  font-size: 20px;
  background: -webkit-linear-gradient(left, #d35400, white, #e67e22);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: bold;
}
span.nav-sub {
  padding: 10px;
}
</style>
