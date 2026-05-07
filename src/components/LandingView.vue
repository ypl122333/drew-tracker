<script setup>
const emit = defineEmits(["switch-view"])
</script>

<template>
  <div class="w-full h-screen flex flex-col items-center justify-center relative z-50 overflow-hidden">
    <div
      class="absolute inset-0 w-full h-full bg-center bg-cover blur-[12px] scale-110"
      style="background-image: url('/Background.jpg')"
    ></div>

    <div class="absolute inset-0 bg-black/50"></div>

    <div class="relative z-10 flex flex-col items-center w-full max-w-5xl px-6">
      <img
        src="/Background.jpg"
        class="h-32 w-32 object-contain drop-shadow-2xl mb-6 rounded-full border-4 border-white/20 bg-white/10 backdrop-blur"
      />

      <h1 class="text-5xl md:text-6xl font-black text-white tracking-tighter drop-shadow-lg text-center uppercase italic mb-12">
        Drew Rangers <br />
        <span class="text-green-400">Tracker Pro</span>
      </h1>

      <div class="flex flex-col sm:flex-row gap-6 w-full max-w-3xl">
        <button
          @click="emit('switch-view', 'practice')"
          class="flex-1 group bg-white/10 backdrop-blur-md border border-white/30 hover:bg-white/20 text-white py-10 rounded-xl shadow-2xl relative overflow-hidden transition-all active:scale-95"
        >
          <div class="relative z-10 flex flex-col items-center">
            <span class="text-xs font-bold text-gray-300 uppercase tracking-widest mb-2 group-hover:text-white transition-colors">
              Training
            </span>
            <span class="text-4xl font-black italic uppercase tracking-tight">
              Practice
            </span>
          </div>
        </button>

        <button
          @click="emit('switch-view', 'game')"
          class="flex-1 group bg-[#144935] border border-green-500 hover:bg-[#0e3325] text-white py-10 rounded-xl shadow-2xl relative overflow-hidden transition-all active:scale-95"
        >
          <div class="relative z-10 flex flex-col items-center">
            <span class="text-xs font-bold text-green-300 uppercase tracking-widest mb-2 group-hover:text-white transition-colors">
              Match Day
            </span>
            <span class="text-4xl font-black italic uppercase tracking-tight">
              Game
            </span>
          </div>
        </button>
      </div>

      <button
        @click="emit('switch-view', 'admin')"
        class="mt-5 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-5 py-2 rounded-lg text-xs font-black uppercase tracking-[0.2em] transition-all active:scale-95"
      >
        Admin
      </button>

      <div class="mt-12 text-white/40 text-xs font-mono">
        Designed by Hanxiang(James) Li and Peilin(Patrick) Yang
      </div>
    </div>
  </div>
</template>
