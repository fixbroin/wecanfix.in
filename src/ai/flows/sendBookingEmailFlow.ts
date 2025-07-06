
'use server';
/**
 * @fileOverview A Genkit flow to send booking confirmation and completion emails.
 *
 * - sendBookingConfirmationEmail - Sends emails to customer and admin.
 * - BookingConfirmationEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';

// Define Zod schema for individual service items within a booking for the email flow
const EmailBookingServiceItemSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  quantity: z.number(),
  pricePerUnit: z.number(),
  discountedPricePerUnit: z.number().optional(),
});

// Define Zod schema for applied platform fees
const EmailPlatformFeeItemSchema = z.object({
  name: z.string(),
  amount: z.number(), // This should be the total amount of the fee (base + tax on fee)
});

// Define Zod schema for the input, now including SMTP settings and platform fees
const BookingConfirmationEmailInputSchema = z.object({
  bookingId: z.string().describe("The unique ID of the booking."),
  customerName: z.string().describe("The name of the customer."),
  customerEmail: z.string().email().describe("The email address of the customer."),
  customerPhone: z.string().describe("The phone number of the customer."),
  addressLine1: z.string().describe("The primary address line."),
  addressLine2: z.string().optional().describe("The secondary address line, if any."),
  city: z.string().describe("The city for the service."),
  state: z.string().describe("The state for the service."),
  pincode: z.string().describe("The pincode for the service address."),
  scheduledDate: z.string().describe("The scheduled date for the service (e.g., YYYY-MM-DD or user-friendly)."),
  scheduledTimeSlot: z.string().describe("The scheduled time slot for the service."),
  services: z.array(EmailBookingServiceItemSchema).describe("An array of services included in the booking."),
  subTotal: z.number().describe("The subtotal amount for the booking before tax and visiting charge."), // This is sum of DISPLAYED item prices
  visitingCharge: z.number().optional().describe("The visiting charge applied, if any."), // This is DISPLAYED visiting charge
  discountAmount: z.number().optional().describe("Discount applied to the booking."),
  discountCode: z.string().optional().describe("Promo code applied, if any."),
  appliedPlatformFees: z.array(EmailPlatformFeeItemSchema).optional().describe("Platform fees applied to the booking."),
  taxAmount: z.number().describe("The total tax amount for the booking."),
  totalAmount: z.number().describe("The total amount for the booking."),
  paymentMethod: z.string().describe("The payment method chosen by the customer."),
  status: z.string().describe("The current status of the booking."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
  // New fields for completion/reschedule email
  emailType: z.enum(['booking_confirmation', 'booking_completion', 'booking_rescheduled']).optional().default('booking_confirmation'),
  invoicePdfBase64: z.string().optional().describe("Base64 encoded PDF invoice content for completion email."),
  previousScheduledDate: z.string().optional().describe("The previous scheduled date for reschedule email."),
  previousScheduledTimeSlot: z.string().optional().describe("The previous scheduled time slot for reschedule email."),
});

export type BookingConfirmationEmailInput = z.infer<typeof BookingConfirmationEmailInputSchema>;

export async function sendBookingConfirmationEmail(input: BookingConfirmationEmailInput): Promise<{ success: boolean; message: string }> {
  console.log("sendBookingConfirmationEmail: Flow invoked with input (passwords/invoice omitted):", {
    ...input,
    smtpPass: input.smtpPass ? '******' : undefined,
    invoicePdfBase64: input.invoicePdfBase64 ? 'PRESENT' : 'NOT_PRESENT',
  });
  try {
    const result = await bookingEmailFlow(input);
    console.log("sendBookingConfirmationEmail: Flow result:", result);
    return result;
  } catch (error) {
    console.error("sendBookingConfirmationEmail: Error calling bookingEmailFlow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process email flow: ${errorMessage}` };
  }
}


const bookingEmailFlow = ai.defineFlow(
  {
    name: 'bookingEmailFlow',
    inputSchema: BookingConfirmationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (bookingDetails) => {
    try { 
      console.log("====== BOOKING EMAIL FLOW START ======");
      console.log("Flow input (password/invoice omitted):", {
          ...bookingDetails,
          smtpPass: bookingDetails.smtpPass ? '******' : undefined,
          invoicePdfBase64: bookingDetails.invoicePdfBase64 ? 'PRESENT' : 'NOT_PRESENT',
      });

      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        emailType = 'booking_confirmation', 
        invoicePdfBase64,
        previousScheduledDate,
        previousScheduledTimeSlot
      } = bookingDetails;

      console.log("SMTP Settings Received by Flow:");
      console.log("  Host:", smtpHost); console.log("  Port:", smtpPort); console.log("  User:", smtpUser);
      console.log("  Pass Present:", !!smtpPass); console.log("  Sender Email:", senderEmail);
      console.log("  Email Type:", emailType);

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;
      console.log("Can attempt real email send:", canAttemptRealEmail);

      let paymentSummary = `
        Items Total: Rs. ${bookingDetails.subTotal.toFixed(2)}
      `;
      if (bookingDetails.discountAmount && bookingDetails.discountAmount > 0) {
        paymentSummary += `
        Discount${bookingDetails.discountCode ? ` (${bookingDetails.discountCode})` : ''}: - Rs. ${bookingDetails.discountAmount.toFixed(2)}
        `;
      }
      if (bookingDetails.visitingCharge && bookingDetails.visitingCharge > 0) {
        paymentSummary += `
        Visiting Charge: + Rs. ${bookingDetails.visitingCharge.toFixed(2)}
        `;
      }
      if (bookingDetails.appliedPlatformFees && bookingDetails.appliedPlatformFees.length > 0) {
        bookingDetails.appliedPlatformFees.forEach(fee => {
          paymentSummary += `
        ${fee.name}: + Rs. ${fee.amount.toFixed(2)}
          `;
        });
      }
      paymentSummary += `
        Total Tax: + Rs. ${bookingDetails.taxAmount.toFixed(2)}
        --------------------
        Total Amount Due: Rs. ${bookingDetails.totalAmount.toFixed(2)}
      `;

      let customerEmailSubject = "";
      let customerEmailBody = "";
      const adminEmail = "fixbro.in@gmail.com"; 
      let adminEmailSubject = "";
      let adminEmailBody = "";
      const attachments: nodemailer.Attachment[] = [];

      if (emailType === 'booking_completion') {
        customerEmailSubject = `Your FixBro Service Completed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = `
          Hi ${bookingDetails.customerName},

          We're pleased to inform you that your service booking (ID: ${bookingDetails.bookingId}) has been successfully completed!
          We hope you are satisfied with our service.

          Booking Details:
          --------------------
          Booking ID: ${bookingDetails.bookingId}
          Scheduled Date: ${bookingDetails.scheduledDate}
          Scheduled Time: ${bookingDetails.scheduledTimeSlot}
          
          Services:
          ${bookingDetails.services.map(s => `  - ${s.name} (x${s.quantity}) - Rs. ${((s.discountedPricePerUnit ?? s.pricePerUnit) * s.quantity).toFixed(2)}`).join('\n')}

          Address: ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}
          
          Final Payment Summary:
          ${paymentSummary.trim().replace(/^\s+/gm, '')} 
          
          Payment Method: ${bookingDetails.paymentMethod}
          Booking Status: ${bookingDetails.status}

          Please find your invoice attached.
          We would greatly appreciate it if you could take a moment to share your feedback. 
          You will be prompted to leave a review the next time you log in or visit our website.

          Thank you for choosing FixBro!
          The FixBro Team
        `;

        adminEmailSubject = `Booking Completed (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = `
          Booking ID ${bookingDetails.bookingId} for ${bookingDetails.customerName} has been marked as COMPLETED.
          An email with the invoice has been sent to the customer.
          Customer: ${bookingDetails.customerName} (${bookingDetails.customerEmail}, ${bookingDetails.customerPhone})
          Services: ${bookingDetails.services.map(s => s.name).join(', ')}
          Total: Rs. ${bookingDetails.totalAmount.toFixed(2)}
          Please verify and follow up if necessary.
        `;

        if (invoicePdfBase64) {
          attachments.push({
            filename: `invoice-${bookingDetails.bookingId}.pdf`,
            content: invoicePdfBase64,
            encoding: 'base64',
            contentType: 'application/pdf'
          });
        }

      } else if (emailType === 'booking_rescheduled') {
        customerEmailSubject = `Your FixBro Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = `
          Hi ${bookingDetails.customerName},

          Your service booking (ID: ${bookingDetails.bookingId}) has been rescheduled.

          Previous Schedule: ${previousScheduledDate || 'N/A'} at ${previousScheduledTimeSlot || 'N/A'}
          New Schedule: ${bookingDetails.scheduledDate} at ${bookingDetails.scheduledTimeSlot}

          Updated Booking Details:
          --------------------
          Booking ID: ${bookingDetails.bookingId}
          Services:
          ${bookingDetails.services.map(s => `  - ${s.name} (x${s.quantity}) - Rs. ${((s.discountedPricePerUnit ?? s.pricePerUnit) * s.quantity).toFixed(2)}`).join('\n')}
          Address: ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}
          
          Payment Summary:
          ${paymentSummary.trim().replace(/^\s+/gm, '')} 
          
          Payment Method: ${bookingDetails.paymentMethod}
          Booking Status: ${bookingDetails.status}

          If you have any questions, please contact us.
          The FixBro Team
        `;
        adminEmailSubject = `Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = `
          Booking ID ${bookingDetails.bookingId} for ${bookingDetails.customerName} has been RESCHEDULED.
          Previous: ${previousScheduledDate || 'N/A'} at ${previousScheduledTimeSlot || 'N/A'}
          New: ${bookingDetails.scheduledDate} at ${bookingDetails.scheduledTimeSlot}
          Customer: ${bookingDetails.customerName} (${bookingDetails.customerEmail}, ${bookingDetails.customerPhone})
          Please check the admin panel for updated details.
        `;

      } else { // booking_confirmation (default)
        customerEmailSubject = `Your FixBro Booking Confirmed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = `
          Hi ${bookingDetails.customerName},

          Thank you for booking with FixBro! Your service has been scheduled.

          Booking Details:
          --------------------
          Booking ID: ${bookingDetails.bookingId}
          Scheduled Date: ${bookingDetails.scheduledDate}
          Scheduled Time: ${bookingDetails.scheduledTimeSlot}
          
          Services:
          ${bookingDetails.services.map(s => `  - ${s.name} (x${s.quantity}) - Rs. ${((s.discountedPricePerUnit ?? s.pricePerUnit) * s.quantity).toFixed(2)}`).join('\n')}

          Address: ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}
          
          Payment Summary:
          ${paymentSummary.trim().replace(/^\s+/gm, '')} 
          
          Payment Method: ${bookingDetails.paymentMethod}
          Booking Status: ${bookingDetails.status}

          We look forward to serving you!
          Thanks,
          The FixBro Team
        `;

        adminEmailSubject = `New Booking Received (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = `
          A new booking has been made on FixBro.

          Booking Details:
          --------------------
          Booking ID: ${bookingDetails.bookingId}
          Customer Name: ${bookingDetails.customerName}
          Customer Email: ${bookingDetails.customerEmail}
          Customer Phone: ${bookingDetails.customerPhone}
          Scheduled Date: ${bookingDetails.scheduledDate}
          Scheduled Time: ${bookingDetails.scheduledTimeSlot}
          Services:
          ${bookingDetails.services.map(s => `  - ${s.name} (x${s.quantity}) - Rs. ${((s.discountedPricePerUnit ?? s.pricePerUnit) * s.quantity).toFixed(2)}`).join('\n')}
          Address: ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}
          Payment Summary:
          ${paymentSummary.trim().replace(/^\s+/gm, '')}
          Payment Method: ${bookingDetails.paymentMethod}
          Booking Status: ${bookingDetails.status}
          Please check the admin panel for more details.
        `;
      }


      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete or missing. Falling back to console logging for emails.");
        console.log(`\n--- SIMULATING Email to Customer (${emailType}) ---`);
        console.log(`To: ${bookingDetails.customerEmail}`);
        console.log(`Subject: ${customerEmailSubject}`);
        console.log(`Body:\n${customerEmailBody}`);
        if (attachments.length > 0) console.log("Attachments:", JSON.stringify(attachments.map(a => ({ filename: a.filename, type: a.contentType }))));
        
        console.log(`\n--- SIMULATING Email to Admin (${emailType}) ---`);
        console.log(`To: ${adminEmail}`);
        console.log(`Subject: ${adminEmailSubject}`);
        console.log(`Body:\n${adminEmailBody}`);
        console.log("====== BOOKING EMAIL FLOW END (SIMULATED) ======");
        return { success: false, message: "SMTP configuration incomplete. Email sending simulated and logged to console." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
          console.error("Invalid SMTP port provided:", smtpPort);
          console.log("====== BOOKING EMAIL FLOW END (ERROR) ======");
          return { success: false, message: "Invalid SMTP port. Email sending aborted." };
      }
      
      const transporterOptions: nodemailer.TransportOptions = {
        host: smtpHost,
        port: portNumber,
        secure: portNumber === 465, 
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      };
      
      console.log("Attempting to create nodemailer transporter with options (password omitted):", {
          ...transporterOptions,
          auth: { ...transporterOptions.auth, pass: '******' }
      });

      let transporter: nodemailer.Transporter;
      try {
          transporter = nodemailer.createTransport(transporterOptions);
          console.log("Nodemailer transporter created.");
      } catch (transportError) {
          console.error("Nodemailer createTransport error:", transportError);
          console.log("====== BOOKING EMAIL FLOW END (TRANSPORT ERROR) ======");
          return { success: false, message: `Failed to create email transporter: ${(transportError as Error).message}. Emails not sent.` };
      }

      try {
        console.log(`Attempting to send ${emailType} email to customer: ${bookingDetails.customerEmail} from FixBro <${senderEmail}>`);
        const customerMailOptions: nodemailer.SendMailOptions = {
          from: `FixBro <${senderEmail}>`,
          to: bookingDetails.customerEmail,
          subject: customerEmailSubject,
          html: customerEmailBody.replace(/\n/g, '<br/>'),
        };
        if (attachments.length > 0) {
          customerMailOptions.attachments = attachments;
        }
        const customerMailInfo = await transporter.sendMail(customerMailOptions);
        console.log("Customer email sendMail completed. Info:", customerMailInfo);

        console.log(`Attempting to send ${emailType} email to admin: ${adminEmail} from FixBro Admin <${senderEmail}>`);
        const adminMailInfo = await transporter.sendMail({
          from: `FixBro Admin <${senderEmail}>`,
          to: adminEmail,
          subject: adminEmailSubject,
          html: adminEmailBody.replace(/\n/g, '<br/>'),
        });
        console.log("Admin email sendMail completed. Info:", adminMailInfo);
        console.log("====== BOOKING EMAIL FLOW END (SUCCESS) ======");
        return { success: true, message: "Booking emails sent successfully." };

      } catch (error: any) {
        console.error("Error during transporter.sendMail:", error);
        console.log("Detailed SMTP Error Object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        console.log(`\n--- FAILED TO SEND REAL EMAIL - Simulating Email to Customer (${emailType} - Fallback) ---`);
        console.log(`To: ${bookingDetails.customerEmail}`);
        console.log(`Subject: ${customerEmailSubject}`);
        console.log(`Body:\n${customerEmailBody}`);
        if (attachments.length > 0) console.log("Attachments (simulated):", JSON.stringify(attachments.map(a => ({ filename: a.filename, type: a.contentType }))));
        
        console.log(`\n--- FAILED TO SEND REAL EMAIL - Simulating Email to Admin (${emailType} - Fallback) ---`);
        console.log(`To: ${adminEmail}`);
        console.log(`Subject: ${adminEmailSubject}`);
        console.log(`Body:\n${adminEmailBody}`);
        console.log("====== BOOKING EMAIL FLOW END (SENDMAIL ERROR) ======");
        return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}. Emails logged to console as fallback.` };
      }
    } catch (flowError) { 
      console.error("====== BOOKING EMAIL FLOW - CRITICAL UNHANDLED EXCEPTION ======", flowError);
      const errorMessage = flowError instanceof Error ? flowError.message : String(flowError);
      return { success: false, message: `Critical error in email flow execution: ${errorMessage}. Emails may not have been sent.` };
    }
  }
);

