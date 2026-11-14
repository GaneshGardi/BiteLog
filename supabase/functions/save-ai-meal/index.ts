import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MealItem = {
  name: string;
  quantity_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  try {
    const authorization = req.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!authorization || !url || !anonKey) {
      return respond({ error: 'Authentication or server configuration missing' }, 401);
    }

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return respond({ error: 'Please sign in again' }, 401);
    }

    const body = await req.json();
    const logDate = body?.log_date;
    const items = body?.items;
    const mealName =
      typeof body?.meal_name === 'string' ? body.meal_name.trim() : '';

    if (
      typeof logDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(logDate) ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 20
    ) {
      return respond({ error: 'Invalid date or meal items' }, 400);
    }

    const parsedDate = new Date(`${logDate}T00:00:00Z`);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== logDate
    ) {
      return respond({ error: 'Invalid log date' }, 400);
    }

    const numericFields = [
      'quantity_g',
      'calories',
      'protein',
      'carbs',
      'fat',
      'fiber',
    ] as const;

    const totals = {
      quantity_g: 0,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    };
    const names: string[] = [];

    for (const item of items as MealItem[]) {
      if (
        !item ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        item.name.trim().length > 120
      ) {
        return respond({ error: 'Invalid food name' }, 400);
      }

      for (const field of numericFields) {
        if (
          typeof item[field] !== 'number' ||
          !Number.isFinite(item[field]) ||
          item[field] < 0
        ) {
          return respond({ error: `Invalid nutrition value: ${field}` }, 400);
        }
      }

      if (
        item.quantity_g <= 0 ||
        item.quantity_g > 10000 ||
        item.calories > 10000 ||
        item.protein > 1000 ||
        item.carbs > 1000 ||
        item.fat > 1000 ||
        item.fiber > 1000
      ) {
        return respond({ error: 'Nutrition values are outside allowed limits' }, 400);
      }

      names.push(item.name.trim());
      totals.quantity_g += item.quantity_g;
      totals.calories += item.calories;
      totals.protein += item.protein;
      totals.carbs += item.carbs;
      totals.fat += item.fat;
      totals.fiber += item.fiber;
    }

    const foodName = (mealName || names.join(', ')).slice(0, 120);

    const { data, error } = await supabase
      .from('food_logs')
      .insert({
        user_id: user.id,
        food_id: null,
        food_name: foodName,
        quantity: Math.round(totals.quantity_g * 10) / 10,
        unit: 'g',
        calories: Math.round(totals.calories * 10) / 10,
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fat: Math.round(totals.fat * 10) / 10,
        fiber: Math.round(totals.fiber * 10) / 10,
        log_date: logDate,
        source: 'ai',
      })
      .select('id, food_name, quantity, calories, protein, carbs, fat, fiber, log_date, source')
      .single();

    if (error) {
      console.error('save-ai-meal database error:', error.message);
      return respond({ error: 'Could not save meal' }, 500);
    }

    return respond({ success: true, items: [data] });
  } catch (error) {
    console.error('save-ai-meal error:', error);
    return respond({ error: 'Unexpected server error' }, 500);
  }
});