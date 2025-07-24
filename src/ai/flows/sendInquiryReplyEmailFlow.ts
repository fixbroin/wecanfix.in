
'use server';
/**
 * @fileOverview A Genkit flow to send email replies to user inquiries.
 *
 * - sendInquiryReplyEmail - Sends an email reply to a user.
 * - InquiryReplyEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';

const InquiryReplyEmailInputSchema = z.object({
  inquiryId: z.string().describe("The ID of the inquiry being replied to."),
  inquiryType: z.enum(['contact', 'popup']).describe("The type of the original inquiry."),
  userName: z.string().describe("The name of the user who submitted the inquiry."),
  userEmail: z.string().email().describe("The email address of the user."),
  originalMessage: z.string().describe("The original message or a summary of the inquiry submitted by the user."),
  replyMessage: z.string().describe("The admin's reply message."),
  adminName: z.string().optional().default("FixBro Support").describe("The name of the admin or support team sending the reply."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from (e.g., support@yourdomain.com)."),
});

export type InquiryReplyEmailInput = z.infer<typeof InquiryReplyEmailInputSchema>;

export async function sendInquiryReplyEmail(input: InquiryReplyEmailInput): Promise<{ success: boolean; message: string }> {
  console.log("sendInquiryReplyEmail: Flow invoked with input (passwords omitted):", {
    ...input,
    smtpPass: input.smtpPass ? '******' : undefined,
  });
  try {
    const result = await inquiryReplyEmailFlow(input);
    console.log("sendInquiryReplyEmail: Flow result:", result);
    return result;
  } catch (error) {
    console.error("sendInquiryReplyEmail: Error calling inquiryReplyEmailFlow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process inquiry reply email flow: ${errorMessage}` };
  }
}

const inquiryReplyEmailFlow = ai.defineFlow(
  {
    name: 'inquiryReplyEmailFlow',
    inputSchema: InquiryReplyEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      console.log("====== INQUIRY REPLY EMAIL FLOW START ======");
      console.log("Flow input (password omitted):", {
          ...details,
          smtpPass: details.smtpPass ? '******' : undefined,
      });

      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        userName, userEmail, originalMessage, replyMessage, adminName, inquiryId
      } = details;

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      const emailSubject = `Re: Your Inquiry to FixBro (ID: ${inquiryId.substring(0,8)}...)`;
      const emailBody = `
        Dear ${userName},

        Thank you for contacting FixBro. This is a reply to your recent inquiry.

        --------------------
        Your Original Inquiry:
        --------------------
        ${originalMessage.trim().replace(/^/gm, '> ')}

        --------------------
        Our Reply:
        --------------------
        ${replyMessage.trim()}

        If you have any further questions, please feel free to reply to this email or contact us again.

        Sincerely,
        The ${adminName || "FixBro Team"}
      `;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete or missing. Falling back to console logging for inquiry reply email.");
        console.log(`\n--- SIMULATING Inquiry Reply Email ---`);
        console.log(`To: ${userEmail}`);
        console.log(`Subject: ${emailSubject}`);
        console.log(`Body:\n${emailBody}`);
        console.log("====== INQUIRY REPLY EMAIL FLOW END (SIMULATED) ======");
        return { success: false, message: "SMTP configuration incomplete. Reply email simulated and logged to console." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
          console.error("Invalid SMTP port provided:", smtpPort);
          return { success: false, message: "Invalid SMTP port. Email sending aborted." };
      }

      const transporterOptions: nodemailer.TransportOptions = {
        host: smtpHost,
        port: portNumber,
        secure: portNumber === 465,
        auth: { user: smtpUser, pass: smtpPass },
      };
      
      console.log("Attempting to create nodemailer transporter for inquiry reply (password omitted):", {
          ...transporterOptions,
          auth: { ...transporterOptions.auth, pass: '******' }
      });

      let transporter: nodemailer.Transporter;
      try {
          transporter = nodemailer.createTransport(transporterOptions);
      } catch (transportError) {
          console.error("Nodemailer createTransport error for inquiry reply:", transportError);
          return { success: false, message: `Failed to create email transporter: ${(transportError as Error).message}. Reply not sent.` };
      }

      try {
        console.log(`Attempting to send inquiry reply email to: ${userEmail} from ${adminName || "FixBro Support"} <${senderEmail}>`);
        const mailOptions: nodemailer.SendMailOptions = {
          from: `${adminName || "FixBro Support"} <${senderEmail}>`,
          to: userEmail,
          subject: emailSubject,
          html: emailBody.replace(/\\n/g, '<br/>').replace(/^> /gm, '&gt; '), // Convert newlines and blockquote
        };
        
        await transporter.sendMail(mailOptions);
        console.log("Inquiry reply email sendMail completed.");
        console.log("====== INQUIRY REPLY EMAIL FLOW END (SUCCESS) ======");
        return { success: true, message: "Inquiry reply email sent successfully." };

      } catch (error: any) {
        console.error("Error during transporter.sendMail for inquiry reply:", error);
        console.log("Detailed SMTP Error Object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        console.log(`\n--- FAILED TO SEND REAL INQUIRY REPLY EMAIL - Simulating (Fallback) ---`);
        console.log(`To: ${userEmail}`);
        console.log(`Subject: ${emailSubject}`);
        console.log(`Body:\n${emailBody}`);
        console.log("====== INQUIRY REPLY EMAIL FLOW END (SENDMAIL ERROR) ======");
        return { success: false, message: `Inquiry reply email sending failed: ${error.message || 'Unknown nodemailer error'}. Email logged to console as fallback.` };
      }
    } catch (flowError) {
      console.error("====== INQUIRY REPLY EMAIL FLOW - CRITICAL UNHANDLED EXCEPTION ======", flowError);
      const errorMessage = flowError instanceof Error ? flowError.message : String(flowError);
      return { success: false, message: `Critical error in inquiry reply email flow: ${errorMessage}. Email may not have been sent.` };
    }
  }
);

    