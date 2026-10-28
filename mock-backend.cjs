const http = require('http');
const url = require('url');

let WebSocketServer;
try {
  WebSocketServer = require('./frontend/node_modules/ws').Server;
} catch (e) {
  try {
    WebSocketServer = require('./frontend-react/node_modules/ws').Server;
  } catch (err2) {
    try {
      WebSocketServer = require('ws').Server;
    } catch (err) {
      WebSocketServer = null;
    }
  }
}

const PORT = Number(process.env.PORT) || 8080;

const mockUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@admin.com',
  full_name: 'Admin User',
  role_id: 'role-super-admin',
  role: {
    id: 'role-super-admin',
    name: 'admin',
    description: 'System Administrator',
    is_system: true,
    permissions: [
      { id: 'p1', resource: 'analytics', action: 'read' },
      { id: 'p2', resource: 'chat', action: 'read' },
      { id: 'p3', resource: 'templates', action: 'read' },
      { id: 'p4', resource: 'campaigns', action: 'read' },
      { id: 'p5', resource: 'users', action: 'read' },
      { id: 'p6', resource: 'contacts', action: 'read' },
      { id: 'p7', resource: 'settings.general', action: 'read' }
    ]
  },
  organization_id: '11111111-1111-1111-1111-111111111111',
  organization_name: 'Whatomate Demo Organization',
  is_super_admin: true,
  is_available: true,
  settings: {
    email_notifications: true,
    new_message_alerts: true,
    campaign_updates: true,
    call_ringtone: 'ring'
  }
};

const mockContacts = [
  {
    id: 'c-101',
    first_name: 'John',
    last_name: 'Doe',
    phone: '+1 (555) 234-5678',
    email: 'john.doe@example.com',
    status: 'active',
    unread_count: 2,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    last_message: {
      content: 'Could you please confirm the schedule for tomorrow?',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      direction: 'inbound',
      status: 'delivered'
    }
  },
  {
    id: 'c-102',
    first_name: 'Sarah',
    last_name: 'Smith',
    phone: '+1 (555) 876-5432',
    email: 'sarah.s@example.com',
    status: 'active',
    unread_count: 0,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    last_message: {
      content: 'Thank you for the quick support! Everything works now.',
      created_at: new Date(Date.now() - 14400000).toISOString(),
      direction: 'inbound',
      status: 'read'
    }
  },
  {
    id: 'c-103',
    first_name: 'David',
    last_name: 'Lee',
    phone: '+1 (555) 432-1098',
    email: 'david.lee@example.com',
    status: 'active',
    unread_count: 0,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    last_message: {
      content: 'Here is your order confirmation #98214.',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      direction: 'outbound',
      status: 'read'
    }
  }
];

const mockMessages = {
  'c-101': [
    {
      id: 'm-1',
      contact_id: 'c-101',
      content: 'Hi there! I had a quick question regarding our upcoming project.',
      direction: 'inbound',
      status: 'read',
      created_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
      id: 'm-2',
      contact_id: 'c-101',
      content: 'Hello John! Glad to help. What would you like to know?',
      direction: 'outbound',
      status: 'read',
      created_at: new Date(Date.now() - 5400000).toISOString()
    },
    {
      id: 'm-3',
      contact_id: 'c-101',
      content: 'Could you please confirm the schedule for tomorrow?',
      direction: 'inbound',
      status: 'delivered',
      created_at: new Date(Date.now() - 3600000).toISOString()
    }
  ],
  'c-102': [
    {
      id: 'm-4',
      contact_id: 'c-102',
      content: 'Thank you for the quick support! Everything works now.',
      direction: 'inbound',
      status: 'read',
      created_at: new Date(Date.now() - 14400000).toISOString()
    }
  ]
};

const mockTemplates = [
  {
    id: 't-1',
    name: 'welcome_greeting',
    category: 'MARKETING',
    language: 'en_US',
    status: 'APPROVED',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Welcome to Whatomate!' },
      { type: 'BODY', text: 'Hi {{1}}, thank you for reaching out. An agent will be with you shortly.' }
    ]
  },
  {
    id: 't-2',
    name: 'order_status_update',
    category: 'UTILITY',
    language: 'en_US',
    status: 'APPROVED',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Order Update #{{1}}' },
      { type: 'BODY', text: 'Your order has been shipped and is expected to arrive on {{2}}.' }
    ]
  }
];

const mockCampaigns = [
  {
    id: 'camp-1',
    name: 'Spring Announcement 2026',
    status: 'completed',
    template_name: 'welcome_greeting',
    total_recipients: 1250,
    sent_count: 1250,
    delivered_count: 1220,
    read_count: 980,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  }
];

const mockWidgets = [
  { id: 'w-1', name: 'Total Messages', description: 'Total number of messages sent and received', data_source: 'messages', metric: 'count', display_type: 'number', color: 'blue', show_change: true, grid_x: 0, grid_y: 0, grid_w: 3, grid_h: 3, is_shared: true, is_default: true },
  { id: 'w-2', name: 'Active Contacts', description: 'Number of contacts with recent activity', data_source: 'contacts', metric: 'count', display_type: 'number', color: 'green', show_change: true, grid_x: 3, grid_y: 0, grid_w: 3, grid_h: 3, is_shared: true, is_default: true },
  { id: 'w-3', name: 'Chatbot Sessions', description: 'Active chatbot conversation sessions', data_source: 'sessions', metric: 'count', display_type: 'number', color: 'purple', show_change: true, grid_x: 6, grid_y: 0, grid_w: 3, grid_h: 3, is_shared: true, is_default: true },
  { id: 'w-4', name: 'Total Campaigns', description: 'Number of bulk message campaigns', data_source: 'campaigns', metric: 'count', display_type: 'number', color: 'orange', show_change: true, grid_x: 9, grid_y: 0, grid_w: 3, grid_h: 3, is_shared: true, is_default: true },
  { id: 'w-5', name: 'Recent Messages', description: 'Latest conversations from your contacts', data_source: 'messages', metric: 'count', display_type: 'table', color: 'blue', show_change: false, grid_x: 0, grid_y: 3, grid_w: 6, grid_h: 8, is_shared: true, is_default: true },
  { id: 'w-6', name: 'Quick Actions', description: 'Common tasks and shortcuts', data_source: 'shortcuts', metric: 'count', display_type: 'shortcuts', color: 'blue', show_change: false, config: { shortcuts: ['chat', 'campaigns', 'templates', 'chatbot'] }, grid_x: 6, grid_y: 3, grid_w: 6, grid_h: 8, is_shared: true, is_default: true }
];

const mockWidgetData = {
  'w-1': { widget_id: 'w-1', value: 3420, change: 12.5, prev_value: 3040 },
  'w-2': { widget_id: 'w-2', value: 428, change: 8.2, prev_value: 395 },
  'w-3': { widget_id: 'w-3', value: 156, change: -3.4, prev_value: 161 },
  'w-4': { widget_id: 'w-4', value: 14, change: 16.7, prev_value: 12 },
  'w-5': {
    widget_id: 'w-5',
    value: 5,
    table_rows: [
      { id: 'r1', label: 'John Doe', sub_label: 'Could you please confirm the schedule for tomorrow?', status: 'delivered', direction: 'inbound', created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: 'r2', label: 'Sarah Smith', sub_label: 'Thank you for the quick support! Everything works now.', status: 'read', direction: 'inbound', created_at: new Date(Date.now() - 14400000).toISOString() },
      { id: 'r3', label: 'David Lee', sub_label: 'Here is your order confirmation #98214.', status: 'read', direction: 'outbound', created_at: new Date(Date.now() - 86400000).toISOString() }
    ]
  },
  'w-6': { widget_id: 'w-6', value: 4 }
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Organization-ID');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let jsonBody = {};
    if (body) {
      try { jsonBody = JSON.parse(body); } catch (_) {}
    }

    const sendJson = (status, payload, cookies = []) => {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (cookies.length > 0) {
        headers['Set-Cookie'] = cookies;
      }
      res.writeHead(status, headers);
      res.end(JSON.stringify(payload));
    };

    const envelope = (data) => ({ status: 'success', data });

    // 1. SSO Providers
    if (pathname === '/api/auth/sso/providers' && method === 'GET') {
      return sendJson(200, envelope([]));
    }

    // 2. Login
    if (pathname === '/api/auth/login' && method === 'POST') {
      const email = jsonBody.email || 'admin@admin.com';
      const currentUser = { ...mockUser, email };
      const cookies = [
        'whm_access=mock-access-token-jwt; Path=/; SameSite=Lax',
        'whm_refresh=mock-refresh-token-jwt; Path=/api/auth/refresh; HttpOnly; SameSite=Lax',
        'whm_csrf=mock-csrf-token-secret; Path=/; SameSite=Lax'
      ];
      return sendJson(200, envelope({
        expires_in: 86400,
        user: currentUser
      }), cookies);
    }

    // 3. WS Token
    if (pathname === '/api/auth/ws-token' && method === 'GET') {
      return sendJson(200, envelope({ token: 'mock-ws-token-123' }));
    }

    // 4. Token Refresh
    if (pathname === '/api/auth/refresh' && method === 'POST') {
      return sendJson(200, envelope({ expires_in: 86400 }));
    }

    // 5. Logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const cookies = [
        'whm_access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'whm_refresh=; Path=/api/auth/refresh; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'whm_csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      ];
      return sendJson(200, { status: 'success', message: 'Logged out' }, cookies);
    }

    // 6. User Info / Me
    if (pathname === '/api/me' && method === 'GET') {
      return sendJson(200, envelope(mockUser));
    }

    // 7. Organizations
    if (pathname === '/api/me/organizations' && method === 'GET') {
      return sendJson(200, envelope([
        {
          id: mockUser.organization_id,
          name: mockUser.organization_name,
          slug: 'whatomate-demo',
          role: 'admin',
          is_default: true
        }
      ]));
    }

    // 8. Contacts List
    if (pathname === '/api/contacts' && method === 'GET') {
      return sendJson(200, envelope(mockContacts));
    }

    // 9. Single Contact
    if (pathname.startsWith('/api/contacts/') && !pathname.includes('/messages') && method === 'GET') {
      const id = pathname.split('/')[3];
      const contact = mockContacts.find(c => c.id === id) || mockContacts[0];
      return sendJson(200, envelope(contact));
    }

    // 10. Messages for Contact
    if (pathname.match(/\/api\/contacts\/[^/]+\/messages/) && method === 'GET') {
      const parts = pathname.split('/');
      const contactId = parts[3];
      const messages = mockMessages[contactId] || mockMessages['c-101'];
      return sendJson(200, envelope(messages));
    }

    // 11. Send Message
    if (pathname.match(/\/api\/contacts\/[^/]+\/messages/) && method === 'POST') {
      const parts = pathname.split('/');
      const contactId = parts[3];
      const newMsg = {
        id: 'm-' + Date.now(),
        contact_id: contactId,
        content: jsonBody.content || jsonBody.message || 'Sample message',
        direction: 'outbound',
        status: 'delivered',
        created_at: new Date().toISOString()
      };
      if (!mockMessages[contactId]) mockMessages[contactId] = [];
      mockMessages[contactId].push(newMsg);
      return sendJson(201, envelope(newMsg));
    }

    // 12. Templates
    if (pathname === '/api/templates' && method === 'GET') {
      return sendJson(200, envelope(mockTemplates));
    }

    // 13. Campaigns
    if (pathname === '/api/campaigns' && method === 'GET') {
      return sendJson(200, envelope(mockCampaigns));
    }

    // 14. Analytics Dashboard
    if (pathname.startsWith('/api/analytics') && method === 'GET') {
      return sendJson(200, envelope({
        total_messages: 3420,
        incoming_messages: 1820,
        outgoing_messages: 1600,
        active_contacts: 428,
        response_rate: 94.2,
        avg_response_time_seconds: 45,
        campaigns_sent: 12
      }));
    }

    // 15. WhatsApp Accounts
    if (pathname === '/api/accounts' && method === 'GET') {
      return sendJson(200, envelope([
        {
          id: 'acc-1',
          name: 'Main Business Line',
          phone_number: '+1 (555) 019-2834',
          status: 'CONNECTED',
          verified: true
        }
      ]));
    }

    // 16. Roles & Users
    if (pathname === '/api/roles' && method === 'GET') {
      return sendJson(200, envelope([mockUser.role]));
    }
    if (pathname === '/api/users' && method === 'GET') {
      return sendJson(200, envelope([mockUser]));
    }

    // 17. Settings & Tags
    if (pathname === '/api/tags' && method === 'GET') {
      return sendJson(200, envelope([
        { id: 'tag-1', name: 'VIP Customer', color: '#10b981' },
        { id: 'tag-2', name: 'Lead', color: '#3b82f6' }
      ]));
    }
    if (pathname === '/api/org/settings' && method === 'GET') {
      return sendJson(200, envelope({
        allow_registration: false,
        theme: 'dark'
      }));
    }

    // 18. Widgets & Dashboard
    if (pathname === '/api/widgets' && method === 'GET') {
      return sendJson(200, envelope(mockWidgets));
    }
    if (pathname === '/api/widgets/data' && method === 'GET') {
      return sendJson(200, envelope(mockWidgetData));
    }
    if (pathname === '/api/widgets/layout' && method === 'POST') {
      return sendJson(200, envelope({ success: true }));
    }

    // Generic Catch-All for any /api route
    if (pathname.startsWith('/api/')) {
      if (method === 'GET') {
        return sendJson(200, envelope([]));
      } else {
        return sendJson(200, envelope({ success: true }));
      }
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
});

// Setup WebSocket server on the same HTTP server
if (WebSocketServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', ws => {
    // Send initial connected state
    ws.send(JSON.stringify({ type: 'connected', payload: { status: 'ok' } }));

    ws.on('message', message => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (_) {}
    });
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Whatomate Backend Server running on http://localhost:${PORT}`);
});
