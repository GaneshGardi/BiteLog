
import { supabase } from './supabase';
import { Sentry } from './sentry';

export async function calculateFood(
  foodId: string,
  quantityG: number
) {
  const { data, error } =
    await supabase.functions.invoke(
      'calculate-food',
      {
        body: {
          food_id: foodId,
          quantity_g: quantityG,
        },
      }
    );

  if (error) {
    Sentry.logger.error('Food calculation failed', {
      operation: 'calculate_food',
    });

    Sentry.captureException(error);

    throw new Error(
      error.message || 'Failed to calculate food nutrition'
    );
  }

  return data;
}

export async function logFood(
  foodId: string,
  quantityG: number,
  logDate: string
) {
  const { data, error } =
    await supabase.functions.invoke(
      'log-food',
      {
        body: {
          food_id: foodId,
          quantity_g: quantityG,
          log_date: logDate,
        },
      }
    );

  if (error) {
    Sentry.logger.error('Food logging request failed', {
      operation: 'log_food',
    });

    Sentry.captureException(error);

    throw new Error(
      error.message || 'Failed to save food'
    );
  }

  return data;
}

export async function saveFood(
  fdcId: number
) {
  const { data, error } =
    await supabase.functions.invoke(
      'save-food',
      {
        body: {
          fdcId,
        },
      }
    );

  if (error) {
    Sentry.logger.error('Food reference save failed', {
      operation: 'save_food_reference',
    });

    Sentry.captureException(error);

    throw new Error(
      error.message || 'Failed to save food reference'
    );
  }

  if (!data?.food?.id) {
    Sentry.logger.error('Food reference returned invalid data', {
      operation: 'save_food_reference',
    });

    throw new Error(
      'Food was saved but no local food ID was returned'
    );
  }

  return data.food;
}
