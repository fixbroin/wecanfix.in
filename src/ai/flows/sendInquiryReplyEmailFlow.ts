
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
import { getBaseUrl } from '@/lib/config';

const InquiryReplyEmailInputSchema = z.object({
  inquiryId: z.string().describe("The ID of the inquiry being replied to."),
  inquiryType: z.enum(['contact', 'popup']).describe("The type of the original inquiry."),
  userName: z.string().describe("The name of the user who submitted the inquiry."),
  userEmail: z.string().email().describe("The email address of the user."),
  originalMessage: z.string().describe("The original message or a summary of the inquiry submitted by the user."),
  replyMessage: z.string().describe("The admin's reply message."),
  adminName: z.string().optional().default("Wecanfix Support").describe("The name of the admin or support team sending the reply."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from (e.g., support@yourdomain.com)."),
  siteName: z.string().optional(),
  logoUrl: z.string().url().optional(),
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

const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
    const finalLogoUrl = logoUrl || `${getBaseUrl()}/default-image.png`;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
    <style>
        body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Roboto', sans-serif; }
        .container { max-width: 100%; margin: 0 auto; background-color: #ffffff; padding: 20px; }
        .header { text-align: center; padding-bottom: 20px; }
        .header img { max-width: 150px; }
        .content { padding: 20px 0; color: #333333; line-height: 1.6; }
        .content h2 { font-family: 'Poppins', sans-serif; color: #333333; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding-top: 20px; border-top: 1px solid #eeeeee; }
        .quote { border-left: 3px solid #eeeeee; padding-left: 15px; margin: 15px 0; color: #777777; background-color: #F8F9FA; padding: 10px 15px; border-radius: 4px;}
    </style>
</head>
<body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FA;">
        <tr>
            <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="20" style="background-color: #ffffff; margin-top: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                        <td>
                             <div class="header">
                                <a href="${getBaseUrl()}" target="_blank" style="text-decoration:none;">

                                    <img src="${finalLogoUrl}" alt="${siteName} Logo" style="border:0; display:inline-block; max-width:150px;">

                                </a>
                            </div>
                            <div class="content">
                                <h2>${title}</h2>
                                ${bodyContent}
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};


const inquiryReplyEmailFlow = ai.defineFlow(
  {
    name: 'inquiryReplyEmailFlow',
    inputSchema: InquiryReplyEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        userName, userEmail, originalMessage, replyMessage, adminName, inquiryId,
        siteName = "Wecanfix", logoUrl,
      } = details;

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      const emailSubject = `Re: Your Inquiry to ${siteName} (ID: ${inquiryId.substring(0,8)}...)`;
      const emailBodyContent = `
        <p>Dear ${userName},</p>
        <p>Thank you for contacting ${siteName}. This is a reply to your recent inquiry.</p>
        <div class="quote">
          <p><strong>Your Original Inquiry:</strong></p>
          <p><em>${originalMessage.trim()}</em></p>
        </div>
        <p><strong>Our Reply:</strong></p>
        <p>${replyMessage.trim().replace(/\n/g, '<br/>')}</p>
        <p>If you have any further questions, please feel free to reply to this email or contact us again.</p>
        <p>Sincerely,<br>The ${adminName || `${siteName} Team`}</p>
      `;

      const htmlBody = createHtmlTemplate("Regarding Your Inquiry", emailBodyContent, siteName, logoUrl);

      if (!canAttemptRealEmail) {
        console.warn("SMTP config incomplete. Simulating inquiry reply.");
        console.log(`To: ${userEmail}\nSubject: ${emailSubject}`);
        return { success: false, message: "SMTP configuration incomplete. Reply email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
          return { success: false, message: "Invalid SMTP port." };
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      await transporter.sendMail({
        from: `${adminName || `${siteName} Support`} <${senderEmail}>`,
        to: userEmail,
        subject: emailSubject,
        html: htmlBody,
      });

      return { success: true, message: "Inquiry reply email sent successfully." };

    } catch (flowError) {
      console.error("CRITICAL ERROR in inquiryReplyEmailFlow:", flowError);
      const errorMessage = flowError instanceof Error ? flowError.message : String(flowError);
      return { success: false, message: `Flow failed: ${errorMessage}.` };
    }
  }
);

    
