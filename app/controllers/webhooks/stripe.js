// import {stripe} from '../../paymentGateways/stripe/index.js'
// import Wallet from '../../models/Wallet.js';
// import Transaction from '../../models/Transaction.js';
// import TableReservation from "../../models/Reservation.js";
// import qrcode from 'qrcode';
// import dotenv from 'dotenv';

// dotenv.config();

// export const handleStripeWebhook = async (req, res) => {
//     const sig = req.headers['stripe-signature'];
//     let event;
//     try {
//         event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
//     } catch (err) {
//         console.error('Webhook signature error:', err);
//         return res.status(400).send(`Webhook Error: ${err.message}`);
//     }

//     if (event.type === 'checkout.session.completed') {
//         const session = event.data.object;
//         const reservationId = session.metadata.reservationId;
//         const userId = session.metadata.userId;

//         try {

//             if (reservationId) {
//                 const reservation = await TableReservation.findById(reservationId);
//                 if (!reservation) return res.status(404).end();

//                 // Update reservation
//                 reservation.isPaid = true;
//                 reservation.status = 'confirmed';
//                 reservation.tokenPaymentDetails = {
//                     transactionId: session.payment_intent,
//                     paymentGateway: 'stripe',
//                     paidAt: new Date(),
//                 };

//                 const qrData = `${process.env.QR_CODE_URL}?table-code=${reservation.tableCode}`;
//                 const qrCodeUrl = await qrcode.toDataURL(qrData);
//                 reservation.qrCode = qrCodeUrl;
//                 await reservation.save();

//                 // Update Wallet
//                 let wallet = await Wallet.findOne({ isMainWallet : true });
//                 wallet.balance += reservation.tokenCharges;
//                 await wallet.save();

//                 // Add Transaction
//                 const transaction = new Transaction({
//                     walletId: wallet._id,
//                     type: 'credit',
//                     reason: 'table booking',
//                     reservationId: reservation._id,
//                     transactionId: session.payment_intent,
//                     amount: reservation.tokenCharges,
//                     status: 'success'
//                 });
//                 await transaction.save();
//             }

//             res.status(200).send('Payment processed');
//         } catch (err) {
//             console.error('Webhook handling error:', err);
//             res.status(500).end();
//         }
//     } else {
//         res.status(200).send('Event received');
//     }
// };
