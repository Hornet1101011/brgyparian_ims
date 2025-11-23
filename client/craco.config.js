const path = require('path');

module.exports = {
  webpack: {
    configure: (config) => {
      // Ensure ignoreWarnings exists
      config.ignoreWarnings = config.ignoreWarnings || [];

      // Quiet-ignore source-map parse warnings coming from @antv/node_modules
      config.ignoreWarnings.push((warning) => {
        try {
          const msg = warning && (warning.message || '');
          if (typeof msg === 'string' && msg.includes('Failed to parse source map')) {
            // If the module resource path references node_modules/@antv or @antv packages, ignore
            const resource = warning.module && warning.module.resource;
            if (resource && resource.indexOf(path.join('node_modules', '@antv')) !== -1) return true;
            // Also ignore generic failed source map messages to reduce noisy logs
            return true;
          }
        } catch (e) {
          // fallthrough
        }
        return false;
      });

      // Also try to ensure any source-map-loader rule excludes @antv packages
      if (config.module && Array.isArray(config.module.rules)) {
        config.module.rules = config.module.rules.map((rule) => {
          try {
            if (rule && rule.use) {
              // rule.use can be an array or object
              const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
              uses.forEach((u) => {
                if (u && u.loader && typeof u.loader === 'string' && u.loader.includes('source-map-loader')) {
                  rule.exclude = rule.exclude || [];
                  // exclude antv modules from source-map-loader processing
                  rule.exclude.push(/node_modules[\\/]@antv/);
                }
              });
            }
          } catch (e) {}
          return rule;
        });
      }

      return config;
    }
  }
};
