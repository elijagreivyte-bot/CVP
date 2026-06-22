const Joi = require('joi');

// ═══════════════════════════════════════════════════════════════
// REUSABLE FIELD SCHEMAS
// ═══════════════════════════════════════════════════════════════

const commonFields = {
  id: Joi.string().uuid().required(),
  uuid: Joi.string().uuid(),
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(6).max(255).required(),
  name: Joi.string().max(255).required(),
  token: Joi.string().required(),
  authorization: Joi.string().pattern(/^Bearer\s+.+$/).required()
};

// ═══════════════════════════════════════════════════════════════
// ANALYZE ENDPOINT
// ═══════════════════════════════════════════════════════════════

const analyzeRequestSchema = Joi.object({
  text: Joi.string().min(100).max(2000000).required(),
  documentName: Joi.string().max(255),
  projectId: Joi.string().uuid(),
  companyProfile: Joi.object({
    name: Joi.string().max(255),
    sector: Joi.string().max(100),
    size: Joi.string().valid('mikro', 'maža', 'vidutinė', 'didelė'),
    specialization: Joi.string().max(500),
    experience: Joi.string().max(500),
    certificates: Joi.string().max(500),
    revenue: Joi.string().max(100)
  }),
  mode: Joi.string().valid('analyze', 'assistant', 'letter', 'supplier').default('analyze')
});

// ═══════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(6).max(255).required(),
  companyProfile: Joi.object({
    name: Joi.string().max(255),
    sector: Joi.string().max(100),
    size: Joi.string().max(50),
    specialization: Joi.string().max(500)
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(6).max(255).required()
});

// ═══════════════════════════════════════════════════════════════
// PROFILE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

const profileSchema = Joi.object({
  companyProfile: Joi.object({
    name: Joi.string().max(255).allow(''),
    sector: Joi.string().max(100).allow(''),
    size: Joi.string().max(50).allow(''),
    specialization: Joi.string().max(500).allow(''),
    experience: Joi.string().max(500).allow(''),
    certificates: Joi.string().max(500).allow(''),
    revenue: Joi.string().max(100).allow('')
  }).unknown(true).required()
});

// ═══════════════════════════════════════════════════════════════
// PROJECT ENDPOINTS
// ═══════════════════════════════════════════════════════════════

const createProjectSchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(1000)
});

const deleteProjectSchema = Joi.object({
  id: Joi.string().uuid().required()
});

// ═══════════════════════════════════════════════════════════════
// HISTORY ENDPOINTS
// ═══════════════════════════════════════════════════════════════

const deleteAnalysisSchema = Joi.object({
  id: Joi.string().uuid().required()
});

const updateOutcomeSchema = Joi.object({
  id: Joi.string().uuid().required(),
  outcome: Joi.string().valid('won', 'lost', 'participated', 'skipped', null)
});

// ═══════════════════════════════════════════════════════════════
// CHAT ENDPOINTS
// ═══════════════════════════════════════════════════════════════

const chatMessageSchema = Joi.object({
  role: Joi.string().valid('user', 'assistant').required(),
  content: Joi.string().max(10000).required()
});

const chatRequestSchema = Joi.object({
  messages: Joi.array().items(chatMessageSchema).min(1).required(),
  context: Joi.object(),
  mode: Joi.string().valid('chat', 'letter', 'supplier').default('chat')
});

// ═══════════════════════════════════════════════════════════════
// CVP SEARCH
// ═══════════════════════════════════════════════════════════════

const cvpSearchSchema = Joi.object({
  q: Joi.string().max(200),
  cpv: Joi.string().max(20),
  min: Joi.number().min(0),
  max: Joi.number().min(0),
  page: Joi.number().min(1).default(1)
});

// ═══════════════════════════════════════════════════════════════
// REMINDER/NOTIFICATION
// ═══════════════════════════════════════════════════════════════

const saveReminderSchema = Joi.object({
  analysisId: Joi.string().uuid(),
  deadline: Joi.date().iso().required(),
  title: Joi.string().max(255)
});

const sendEmailSchema = Joi.object({
  to: Joi.string().email().required(),
  result: Joi.object().required()
});

// ═══════════════════════════════════════════════════════════════
// CHECKOUT
// ═══════════════════════════════════════════════════════════════

const checkoutSchema = Joi.object({
  plan: Joi.string().valid('monthly', 'yearly').required()
});

// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPER
// ═══════════════════════════════════════════════════════════════

function validate(data, schema) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(d => ({
      field: d.path.join('.') || d.path,
      message: d.message.replace(/"/g, '')
    }));
    return { error: true, details, value: null };
  }

  return { error: false, details: [], value };
}

module.exports = {
  // Field schemas
  commonFields,

  // Endpoint schemas
  analyzeRequestSchema,
  registerSchema,
  loginSchema,
  profileSchema,
  createProjectSchema,
  deleteProjectSchema,
  deleteAnalysisSchema,
  updateOutcomeSchema,
  chatMessageSchema,
  chatRequestSchema,
  cvpSearchSchema,
  saveReminderSchema,
  sendEmailSchema,
  checkoutSchema,

  // Utility
  validate
};
