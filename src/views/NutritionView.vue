<script setup>
import { ref } from 'vue'
import { Flame, Zap, Snowflake, ChevronDown } from 'lucide-vue-next'

const activeTab = ref('HIGH')
const expandedMeal = ref(null)

function toggleMeal(id) {
  expandedMeal.value = expandedMeal.value === id ? null : id
}

const tabs = [
  { id: 'HIGH', label: 'High', icon: Flame, color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', cal: '~3,000 kcal', desc: 'Long runs, race sims, back-to-back weekends, mountain days' },
  { id: 'MODERATE', label: 'Moderate', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', cal: '~2,500 kcal', desc: 'Easy run + gym, tempo, hill repeats' },
  { id: 'LOW', label: 'Low', icon: Snowflake, color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30', cal: '~2,100 kcal', desc: 'Rest days, easy-only days, taper' }
]

const meals = {
  HIGH: {
    macros: { carbs: '5g/kg (~475g)', protein: '2g/kg (~190g)', fat: '0.8g/kg (~76g)' },
    schedule: [
      {
        id: 'h-breakfast',
        time: '7:00-8:00',
        name: 'Breakfast (post-training)',
        protein: '35-40g',
        options: [
          { title: '4 Eggs + Oats Bowl', desc: '4 eggs scrambled + 100g oats with soy milk, banana, chia seeds, nuts. Tea + PeptiStrong 2.4g' },
          { title: '4 Eggs + Sourdough', desc: '4 eggs poached + 2 slices sourdough toast, 1/2 avocado, spinach, olive oil. Tea + PeptiStrong 2.4g' }
        ]
      },
      {
        id: 'h-shake',
        time: '10:00',
        name: 'Protein Shake',
        protein: '40g',
        options: [
          { title: 'Pea Protein Shake', desc: '40g pea/rice protein blend with water. Non-negotiable daily.' }
        ]
      },
      {
        id: 'h-lunch',
        time: '12:30-13:30',
        name: 'Lunch',
        protein: '45g',
        options: [
          { title: 'Grain Bowl', desc: '200g quinoa + 250g firm tofu (pan-fried) + roasted broccoli, peppers, edamame + tahini-lemon dressing' },
          { title: 'Lentil Power Plate', desc: '200g brown rice + 300g cooked lentils + roasted sweet potato, spinach, tomatoes + olive oil & cumin' },
          { title: 'Chickpea Wrap', desc: 'Large whole wheat tortilla + 200g spiced chickpeas + shredded cabbage, carrot, cucumber + hummus & hot sauce' },
          { title: 'Tempeh Stir-fry', desc: '200g rice noodles + 150g marinated tempeh + pak choi, mushrooms, snap peas + soy-ginger sauce' },
          { title: 'Egg Fried Rice', desc: '200g day-old rice + 3 eggs + 100g edamame + peas, corn, spring onion, spinach + sesame oil & soy' }
        ]
      },
      {
        id: 'h-snack',
        time: '15:30-16:00',
        name: 'Afternoon Snack',
        protein: '20g',
        options: [
          { title: 'Greek Yogurt Bowl', desc: '200g Greek yogurt + 30g mixed nuts + honey' },
          { title: 'Rice Cakes + Nut Butter', desc: '2 rice cakes + nut butter + banana slices' }
        ]
      },
      {
        id: 'h-dinner',
        time: '19:00-20:00',
        name: 'Dinner',
        protein: '45g',
        options: [
          { title: 'Lentil Bolognese', desc: 'Red lentil sauce over 150g pasta + side salad' },
          { title: 'Tofu Curry', desc: 'Coconut curry with 250g tofu, chickpeas, spinach, over rice' },
          { title: 'Stuffed Sweet Potatoes', desc: 'Baked sweet potato + black beans, corn, avocado, salsa' },
          { title: 'Shakshuka', desc: '4 eggs poached in spiced tomato sauce + crusty bread' },
          { title: 'Veggie Chili', desc: 'Kidney beans, black beans, peppers, tomato over quinoa' },
          { title: 'Frittata', desc: '4-egg frittata with roasted vegetables + bread on the side' }
        ]
      },
      {
        id: 'h-evening',
        time: '21:00',
        name: 'Evening',
        protein: '20g',
        options: [
          { title: 'Cottage Cheese', desc: '150g cottage cheese with pumpkin seeds' },
          { title: 'Greek Yogurt', desc: '200g Greek yogurt with seeds' }
        ]
      }
    ]
  },
  MODERATE: {
    macros: { carbs: '3g/kg (~285g)', protein: '2g/kg (~190g)', fat: '0.8g/kg (~76g)' },
    schedule: [
      {
        id: 'm-breakfast',
        time: '7:00-8:00',
        name: 'Breakfast',
        protein: '35-40g',
        options: [
          { title: '4 Eggs + Oats (same as HIGH)', desc: 'Same breakfast options as HIGH day. Post-training fuel stays the same.' }
        ]
      },
      {
        id: 'm-shake',
        time: '10:00',
        name: 'Protein Shake',
        protein: '40g',
        options: [
          { title: 'Pea Protein Shake', desc: '40g pea/rice protein blend with water. Same as every day.' }
        ]
      },
      {
        id: 'm-lunch',
        time: '12:30-13:30',
        name: 'Lunch (reduced carbs)',
        protein: '45g',
        options: [
          { title: 'Same meals as HIGH but...', desc: 'Reduce carb base by 30%: 130g rice/quinoa instead of 200g. Keep protein portion the same (250g tofu, 300g lentils). Add extra vegetables to fill the plate.' }
        ]
      },
      {
        id: 'm-snack',
        time: '15:30',
        name: 'Afternoon Snack (lighter)',
        protein: '15g',
        options: [
          { title: 'Greek Yogurt Only', desc: '150g Greek yogurt, no nuts, no honey. Or skip if not hungry.' }
        ]
      },
      {
        id: 'm-dinner',
        time: '19:00-20:00',
        name: 'Dinner (reduced carbs)',
        protein: '45g',
        options: [
          { title: 'Same meals as HIGH but...', desc: 'Reduce carb portion by 30% (less pasta/rice/bread). Double the vegetables. Keep protein the same.' }
        ]
      },
      {
        id: 'm-evening',
        time: '21:00',
        name: 'Evening',
        protein: '0g',
        options: [
          { title: 'No evening snack', desc: 'Skip unless genuinely hungry. Herbal tea only.' }
        ]
      }
    ]
  },
  LOW: {
    macros: { carbs: '2g/kg (~190g)', protein: '2.2g/kg (~210g)', fat: '0.9g/kg (~86g)' },
    schedule: [
      {
        id: 'l-breakfast',
        time: '7:00-8:00',
        name: 'Breakfast (high protein, low carb)',
        protein: '35g',
        options: [
          { title: '4 Eggs + Vegetables', desc: '4 eggs scrambled with spinach, mushrooms, peppers. No toast. No oats. Tea + PeptiStrong 2.4g.' }
        ]
      },
      {
        id: 'l-shake',
        time: '10:00',
        name: 'Protein Shake',
        protein: '40g',
        options: [
          { title: 'Pea Protein with Water', desc: '40g pea/rice protein + water only. No banana, no extras.' }
        ]
      },
      {
        id: 'l-lunch',
        time: '12:30-13:30',
        name: 'Lunch (protein + veg, no starch)',
        protein: '45g',
        options: [
          { title: 'Big Protein Salad', desc: 'Large salad with 250g tofu or tempeh, avocado, seeds, olive oil dressing. No rice, no bread.' },
          { title: '4-Egg Omelette', desc: '4-egg omelette with vegetables (peppers, mushrooms, spinach). Side salad. No bread.' }
        ]
      },
      {
        id: 'l-snack',
        time: '15:30',
        name: 'Afternoon',
        protein: '0g',
        options: [
          { title: 'Skip or herbal tea', desc: 'No snack. Drink water or herbal tea. Stay busy.' }
        ]
      },
      {
        id: 'l-dinner',
        time: '19:00 (stop eating by 20:00)',
        name: 'Dinner (protein + veg, no starch)',
        protein: '45g',
        options: [
          { title: 'Tofu/Tempeh Stir-fry', desc: '250g tofu or tempeh with vegetables (no rice, no noodles).' },
          { title: 'Frittata + Salad', desc: '4-egg frittata with roasted vegetables. Large side salad.' }
        ]
      },
      {
        id: 'l-evening',
        time: '',
        name: 'Evening',
        protein: '0g',
        options: [
          { title: 'Nothing after 20:00', desc: '14h fasting window until breakfast. Herbal tea only.' }
        ]
      }
    ]
  }
}

const rules = [
  'Zero alcohol — all 7 weeks, no exceptions',
  'No liquid calories — water, black coffee, herbal tea only',
  'Track food in MyFitnessPal (at least weeks 1-3)',
  '10,000+ steps on rest days (NEAT burns 200-400 extra kcal/day)',
  'Eat slowly, stop at 80% full',
  'Front-load calories — biggest meals at breakfast/lunch',
  'Meal prep on Sunday — cook grains, chop veg, marinate tofu',
  'Never restrict on long run days or the day after',
  'Morning weigh-in every day (Monday = official)'
]

const supplements = [
  { name: 'PeptiStrong', dose: '2.4g', timing: 'With breakfast', color: 'text-accent-primary' },
  { name: 'Creatine', dose: '5g', timing: 'With breakfast (STOP May 18)', color: 'text-yellow-400' },
  { name: 'Protein shake', dose: '40g pea protein', timing: '10:00 AM daily', color: 'text-green-400' },
  { name: 'Omega-3', dose: 'As current', timing: 'With meal', color: 'text-text-muted' },
  { name: 'Vitamin D', dose: '2,000-4,000 IU', timing: 'Morning with fat', color: 'text-text-muted' },
  { name: 'Magnesium glycinate', dose: '400mg', timing: 'Before bed (21:30)', color: 'text-blue-400' },
  { name: 'B12', dose: '1,000 mcg', timing: 'Morning', color: 'text-text-muted' },
  { name: 'Collagen peptides', dose: '15g', timing: 'Morning with vit C', color: 'text-text-muted' },
  { name: 'Electrolyte mix', dose: 'During training', timing: 'All runs >60min', color: 'text-text-muted' }
]
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-xl font-bold text-text-primary">Nutrition Plan</h1>
      <p class="text-sm text-text-muted mt-1">Carb cycling: eat to match the day's demand. Target: 190-210g protein daily.</p>
    </div>

    <!-- Day Type Tabs -->
    <div class="flex gap-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="flex-1 p-3 rounded-xl border-2 transition-all duration-200"
        :class="[
          activeTab === tab.id
            ? `${tab.bg} ${tab.border} ${tab.color}`
            : 'bg-bg-tertiary border-border text-text-muted hover:border-text-muted'
        ]"
      >
        <div class="flex items-center justify-center gap-2">
          <component :is="tab.icon" class="w-4 h-4" />
          <span class="font-semibold text-sm">{{ tab.label }}</span>
        </div>
        <p class="text-xs mt-1 opacity-80">{{ tab.cal }}</p>
      </button>
    </div>

    <!-- Active Day Type -->
    <div v-for="tab in tabs" :key="tab.id" v-show="activeTab === tab.id">
      <!-- Description -->
      <div :class="['card border', tab.border, tab.bg]" class="mb-4">
        <p :class="['text-sm font-medium', tab.color]">{{ tab.desc }}</p>
        <div class="flex gap-6 mt-3 text-xs text-text-muted">
          <span>Carbs: <span class="text-text-primary font-medium">{{ meals[tab.id].macros.carbs }}</span></span>
          <span>Protein: <span class="text-text-primary font-medium">{{ meals[tab.id].macros.protein }}</span></span>
          <span>Fat: <span class="text-text-primary font-medium">{{ meals[tab.id].macros.fat }}</span></span>
        </div>
      </div>

      <!-- Meal Schedule -->
      <div class="space-y-2">
        <div
          v-for="meal in meals[tab.id].schedule"
          :key="meal.id"
          class="card bg-bg-tertiary overflow-hidden"
        >
          <!-- Meal Header -->
          <div
            @click="toggleMeal(meal.id)"
            class="flex items-center justify-between cursor-pointer"
          >
            <div class="flex items-center gap-3">
              <span v-if="meal.time" class="text-xs font-mono text-text-muted w-16 flex-shrink-0">{{ meal.time }}</span>
              <span v-else class="w-16 flex-shrink-0"></span>
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ meal.name }}</p>
                <p class="text-xs text-text-muted">{{ meal.protein }} protein</p>
              </div>
            </div>
            <ChevronDown
              class="w-4 h-4 text-text-muted transition-transform"
              :class="{ 'rotate-180': expandedMeal === meal.id }"
            />
          </div>

          <!-- Meal Options (expanded) -->
          <div v-if="expandedMeal === meal.id" class="mt-3 space-y-2 border-t border-border pt-3">
            <div
              v-for="(option, oi) in meal.options"
              :key="oi"
              class="p-3 rounded-lg bg-bg-secondary"
            >
              <p class="text-sm font-medium text-text-primary">{{ option.title }}</p>
              <p class="text-xs text-text-muted mt-1 leading-relaxed">{{ option.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rules -->
    <div class="card">
      <h3 class="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">Weight Cut Rules</h3>
      <div class="space-y-2">
        <div v-for="(rule, i) in rules" :key="i" class="flex items-start gap-2">
          <span class="text-xs text-accent-primary font-bold mt-0.5">{{ i + 1 }}</span>
          <p class="text-sm text-text-secondary">{{ rule }}</p>
        </div>
      </div>
    </div>

    <!-- Supplements -->
    <div class="card">
      <h3 class="text-sm font-semibold text-text-primary uppercase tracking-wider mb-3">Daily Supplements</h3>
      <div class="space-y-2">
        <div v-for="sup in supplements" :key="sup.name" class="flex items-center justify-between p-2 rounded-lg bg-bg-tertiary">
          <div class="flex items-center gap-3">
            <span :class="['text-sm font-medium', sup.color]">{{ sup.name }}</span>
          </div>
          <div class="text-right">
            <p class="text-xs text-text-primary">{{ sup.dose }}</p>
            <p class="text-[10px] text-text-muted">{{ sup.timing }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
