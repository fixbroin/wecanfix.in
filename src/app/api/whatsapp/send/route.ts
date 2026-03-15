
import { type NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getBaseUrl } from '@/lib/config';

// Handler for the POST method
export async function POST(req: NextRequest) {
  // Check for the correct request method
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  // Retrieve environment variables
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error("WhatsApp environment variables (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) are not set.");
    return NextResponse.json({ success: false, error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    // Parse the request body
    const body = await req.json();
    const { to, templateName, parameters = [] } = body;

    // Validate essential parameters
    if (!to || !templateName) {
      return NextResponse.json({ success: false, error: 'Missing `to` or `templateName` in request body.' }, { status: 400 });
    }

    // Construct the components array
    const components = [];

    // All templates have an image header, so we can add it unconditionally
    components.push({
      type: "header",
      parameters: [{
        type: "image",
        image: {
          // This URL must be a public, permanent link to the image approved in your template.
          link: `${getBaseUrl()}/default-image.png` 
        }
      }]
    });
    

    // Add body component if there are parameters
    if (parameters.length > 0) {
      components.push({
        type: "body",
        parameters: parameters.map((param: string) => ({ type: "text", text: param })),
      });
    }

    // According to the error "Button at index 0 of type Url does not require parameters",
    // the button component should not be sent for these templates as the URL is static.
    // The button is part of the template itself on Meta's side.

    // Construct the final request payload
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: components,
      },
    };

    // Make the API call to WhatsApp
    const result = await axios.post(
      `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Return a success response
    return NextResponse.json({ success: true, result: result.data });

  } catch (error: any) {
    // Log detailed error information for debugging
    console.error("WhatsApp API Error:", error.response?.data || error.message);
    
    // Return a generic error response to the client
    return NextResponse.json({ 
      success: false, 
      error: error.response?.data?.error?.message || error.message || 'An unknown error occurred.'
    }, { status: 500 });
  }
}
