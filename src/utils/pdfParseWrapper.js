// Wrapper for pdf-parse to prevent debug mode issues
const originalModule = require('pdf-parse');

// Override the module.parent check to prevent debug mode
const originalModuleParent = module.parent;
Object.defineProperty(module, 'parent', {
  get: function() {
    return originalModuleParent;
  },
  configurable: true
});

module.exports = originalModule;