// ═══════════════════════════════════════════════════════════════
//  Netlify Function — Stripe Webhook
//  Déclenché par Stripe après chaque paiement réussi
//  Envoie l'email de confirmation au client via EmailJS
// ═══════════════════════════════════════════════════════════════

const https = require('https');

// Envoie une requête HTTPS
function httpsPost(hostname, path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: response }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  // Seulement les requêtes POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);

    // Vérifier que c'est bien un paiement réussi
    if (payload.type !== 'checkout.session.completed' &&
        payload.type !== 'payment_intent.succeeded') {
      return { statusCode: 200, body: 'Event ignored' };
    }

    // ── Extraire les infos du paiement ──────────────────────────
    let customerEmail = '';
    let customerName  = '';
    let clientRef     = '';

    if (payload.type === 'checkout.session.completed') {
      const session = payload.data.object;
      customerEmail = session.customer_details?.email || session.customer_email || '';
      customerName  = session.customer_details?.name  || '';
      clientRef     = session.client_reference_id     || ''; // prenom_nom_date
    } else {
      const pi = payload.data.object;
      customerEmail = pi.receipt_email || '';
      customerName  = pi.shipping?.name || '';
    }

    // Décoder le client_reference_id (format: prenom_nom_date)
    let prenom = '', nom = '', dateDebut = '';
    if (clientRef) {
      const parts = clientRef.split('_');
      prenom     = parts[0] || '';
      nom        = parts[1] || '';
      dateDebut  = parts[2] || '';
    }

    const toName = customerName || (prenom + ' ' + nom).trim() || 'Client';

    console.log(`✅ Paiement reçu — Email: ${customerEmail}, Nom: ${toName}`);

    // ── Envoyer l'email via EmailJS ──────────────────────────────
    const emailjsData = {
      service_id:  'service_atd2s6l',
      template_id: 'template_qwnd3ym',
      user_id:     'B1MQrH9PEm3Dgv90c',
      accessToken: '5xRd8ML4C5dTT923ecrFQ',
      template_params: {
        to_name:     toName,
        to_email:    customerEmail,
        vehicule:    'Voir détails de réservation',
        date_debut:  dateDebut || 'À confirmer',
        date_fin:    'À confirmer',
        heure_debut: 'À confirmer',
        heure_fin:   'À confirmer',
        livraison:   'À confirmer',
        adresse:     'À confirmer',
        telephone:   'À confirmer',
        total:       'À confirmer',
        depot:       '50$',
        solde:       'À confirmer'
      }
    };

    const result = await httpsPost('api.emailjs.com', '/api/v1.0/email/send', emailjsData);
    console.log(`EmailJS response: ${result.status} — ${result.body}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, emailSent: result.status === 200 })
    };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: 'Internal error: ' + err.message };
  }
};
