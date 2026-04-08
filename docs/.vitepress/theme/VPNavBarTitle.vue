<template>
  <div class="bee-nav-container" v-if="hasSidebar">
    <div>
      <div class="bee-nav-hero">
        BEE
      </div>
      <span class="nav-sub">Backend Engineering Essentials</span>
    </div>
  </div>
</template>

<script setup>
import { useSidebar } from 'vitepress/theme';
const { hasSidebar } = useSidebar();
</script>

<style>
.bee-nav-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 15px 0;
}
.bee-nav-hero {
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
