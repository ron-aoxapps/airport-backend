import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createStripePaymentLink = async (payload) => {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: payload.currency ? payload.currency : 'usd',
          product_data: {
            name: 'Table Token Charge',
          },
          unit_amount: payload.amount * 100,
        },
        quantity: 1,
      }],
      metadata: {
        reservationId: payload.reservationId,
        userId: payload.userId
      },
      success_url: payload.success_url,
      cancel_url: payload.cancel_url
    });

    return session.url
}