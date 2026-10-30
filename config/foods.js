'use strict';

/**
 * Starter food library.
 *
 * Values are *approximate* per the stated serving, compiled from common
 * nutrition references (IFCT / USDA style figures) for typical Indian and
 * Kerala preparations. Cooking method, oil and portion size change them
 * materially, so the UI labels every value as an estimate and the user can
 * override anything with a custom food.
 */
const FOOD_SEED = [
  // name, serving, kcal, protein, carbs, fat, category
  ['Boiled egg', '1 large (50 g)', 78, 6.3, 0.6, 5.3, 'protein'],
  ['Egg white', '1 white', 17, 3.6, 0.2, 0.1, 'protein'],
  ['Omelet', '2 eggs + 1 tsp oil', 220, 13, 1, 18, 'protein'],
  ['Chicken breast (cooked)', '100 g', 165, 31, 0, 3.6, 'protein'],
  ['Chicken curry', '1 serving (150 g)', 240, 20, 6, 15, 'curry'],
  ['Chicken biryani', '1 cup (200 g)', 350, 18, 40, 13, 'rice'],
  ['Beef fry', '100 g', 250, 26, 2, 16, 'protein'],
  ['Fish (cooked)', '100 g', 150, 22, 1, 6, 'protein'],
  ['Fish curry (coconut)', '1 serving (150 g)', 230, 18, 6, 15, 'curry'],
  ['Prawns (cooked)', '100 g', 99, 24, 0.2, 0.3, 'protein'],
  ['Rice (cooked)', '1 cup (150 g)', 205, 4.3, 45, 0.4, 'rice'],
  ['Brown rice (cooked)', '1 cup (150 g)', 216, 5, 45, 1.8, 'rice'],
  ['Chapati', '1 medium (45 g)', 120, 3.5, 22, 2.5, 'grain'],
  ['Puttu', '1 cup (120 g)', 180, 3.5, 38, 1, 'grain'],
  ['Dosa', '1 medium (80 g)', 133, 2.9, 24, 2.9, 'grain'],
  ['Idli', '1 piece (40 g)', 58, 2, 12, 0.3, 'grain'],
  ['Appam', '1 medium', 120, 2.5, 23, 2, 'grain'],
  ['Idiyappam', '2 pieces', 150, 3, 32, 1, 'grain'],
  ['Oats (with water)', '40 g dry', 150, 5, 27, 3, 'grain'],
  ['Bread', '2 slices (60 g)', 160, 5, 30, 2, 'grain'],
  ['Tapioca (kappa, cooked)', '100 g', 160, 1.4, 38, 0.3, 'grain'],
  ['Banana', '1 medium (118 g)', 105, 1.3, 27, 0.4, 'fruit'],
  ['Papaya', '1 cup (145 g)', 62, 0.7, 16, 0.4, 'fruit'],
  ['Orange', '1 medium', 62, 1.2, 15, 0.2, 'fruit'],
  ['Apple', '1 medium', 95, 0.5, 25, 0.3, 'fruit'],
  ['Milk (full fat)', '250 ml', 160, 8, 12, 8.5, 'dairy'],
  ['Curd', '150 g', 100, 5.5, 6, 5, 'dairy'],
  ['Paneer', '100 g', 265, 18, 3, 20, 'dairy'],
  ['Dal (cooked)', '1 cup (200 g)', 198, 12, 30, 4, 'curry'],
  ['Kadala curry', '1 cup (150 g)', 230, 10, 25, 9, 'curry'],
  ['Sambar', '1 cup (200 g)', 120, 6, 15, 4, 'curry'],
  ['Rasam', '1 cup (200 g)', 60, 2, 8, 2, 'curry'],
  ['Mixed vegetables (cooked)', '1 cup (150 g)', 90, 4, 12, 3, 'vegetable'],
  ['Spinach thoran', '1 cup (100 g)', 110, 4, 8, 7, 'vegetable'],
  ['Coconut chutney', '2 tbsp (30 g)', 90, 2, 4, 8, 'condiment'],
  ['Peanuts', '30 g', 170, 7.7, 5, 15, 'snack'],
  ['Almonds', '20 g', 116, 4.2, 4.3, 10, 'snack'],
  ['Ghee', '1 tsp (5 g)', 45, 0, 0, 5, 'fat'],
  ['Butter', '1 tsp (5 g)', 36, 0, 0, 4, 'fat'],
  ['Tea with milk and sugar', '200 ml', 90, 3, 11, 3, 'drink'],
  ['Black coffee', '200 ml', 5, 0.3, 0, 0, 'drink'],
  ['Whey protein', '1 scoop (30 g)', 120, 24, 3, 1.5, 'supplement'],
];

module.exports = { FOOD_SEED };
