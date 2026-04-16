/**
 * EmailProviderManager - Centralized utility for SMTP/Email provider configuration
 * 
 * Manages:
 * - Provider-specific validation rules and required fields
 * - Default ports for each provider
 * - Automatic secure flag calculation based on port
 * - Provider configuration normalization
 */

export type EmailProvider = 'custom' | 'mailtrap' | 'sendgrid' | 'gmail' | 'aws-ses';

/**
 * Provider configuration with required fields and defaults
 */
interface ProviderConfig {
  requiredFields: string[];
  defaultPort: number;
  commonPorts: number[];
  supportsSecure: boolean;
}

/**
 * Configuration for each email provider
 */
const PROVIDER_CONFIGS: Record<EmailProvider, ProviderConfig> = {
  custom: {
    requiredFields: ['host', 'port', 'user', 'password', 'fromEmail'],
    defaultPort: 587,
    commonPorts: [25, 465, 587, 2525, 3025], // Plain, SSL, TLS, Mailtrap, etc.
    supportsSecure: true,
  },
  mailtrap: {
    requiredFields: ['host', 'port', 'user', 'password', 'fromEmail'],
    defaultPort: 2525,
    commonPorts: [465, 587, 2525],
    supportsSecure: true,
  },
  sendgrid: {
    requiredFields: ['apiKey', 'fromEmail'],
    defaultPort: 0, // Not applicable
    commonPorts: [],
    supportsSecure: false,
  },
  gmail: {
    requiredFields: ['user', 'password', 'fromEmail'],
    defaultPort: 465,
    commonPorts: [465, 587],
    supportsSecure: true,
  },
  'aws-ses': {
    requiredFields: ['awsAccessKeyId', 'awsSecretAccessKey', 'awsRegion', 'fromEmail'],
    defaultPort: 0, // Not applicable
    commonPorts: [],
    supportsSecure: false,
  },
};

/**
 * Port to secure flag mapping
 * Determines if SSL/TLS should be enabled based on port number
 */
const PORT_TO_SECURE_MAP: Record<number, boolean> = {
  25: false,   // Plain SMTP
  465: true,   // SMTPS (implicit TLS)
  587: false,  // Submission (STARTTLS)
  2525: false, // Mailtrap (TLS recommended but not required)
  3025: false, // Alt submission port
};

export class EmailProviderManager {
  /**
   * Get required fields for a provider
   */
  static getRequiredFields(provider: EmailProvider): string[] {
    return PROVIDER_CONFIGS[provider]?.requiredFields || [];
  }

  /**
   * Get default port for a provider
   */
  static getDefaultPort(provider: EmailProvider): number {
    return PROVIDER_CONFIGS[provider]?.defaultPort || 587;
  }

  /**
   * Get common ports for a provider (for dropdown/suggestions)
   */
  static getCommonPorts(provider: EmailProvider): number[] {
    return PROVIDER_CONFIGS[provider]?.commonPorts || [587];
  }

  /**
   * Check if provider supports secure connections
   */
  static supportsSecure(provider: EmailProvider): boolean {
    return PROVIDER_CONFIGS[provider]?.supportsSecure ?? true;
  }

  /**
   * Calculate secure flag based on port number
   * Returns true for SSL ports (465), false for STARTTLS (587)
   * Falls back to default if port not recognized
   */
  static calculateSecureFromPort(port: number, provider: EmailProvider = 'custom'): boolean {
    // Direct mapping if port is known
    if (port in PORT_TO_SECURE_MAP) {
      return PORT_TO_SECURE_MAP[port];
    }

    // For unknown ports, default based on provider
    // SSL ports (>= 465) typically use implicit TLS
    // Lower ports typically use STARTTLS
    if (port >= 465) {
      return true;
    }

    return false;
  }

  /**
   * Validate a provider configuration
   * Returns array of validation errors (empty if valid)
   */
  static validateConfig(
    config: Record<string, any>,
    provider: EmailProvider
  ): string[] {
    const errors: string[] = [];
    const requiredFields = this.getRequiredFields(provider);

    for (const field of requiredFields) {
      const value = config[field];

      // Check if field exists and is not empty
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`${this.formatFieldName(field)} is required`);
        continue;
      }

      // Provider-specific validation
      switch (field) {
        case 'port':
          if (!Number.isInteger(value) || value < 1 || value > 65535) {
            errors.push(`${this.formatFieldName(field)} must be between 1 and 65535`);
          }
          break;

        case 'fromEmail':
        case 'user':
          if (typeof value === 'string' && !value.includes('@')) {
            errors.push(
              `${this.formatFieldName(field)} must be a valid email address`
            );
          }
          break;

        case 'host':
          if (typeof value === 'string' && value.trim().length < 3) {
            errors.push(`${this.formatFieldName(field)} appears invalid`);
          }
          break;

        case 'password':
        case 'apiKey':
        case 'awsAccessKeyId':
        case 'awsSecretAccessKey':
          if (typeof value === 'string' && value.length === 0) {
            errors.push(`${this.formatFieldName(field)} cannot be empty`);
          }
          break;

        case 'awsRegion':
          if (typeof value === 'string' && value.trim().length < 2) {
            errors.push(`${this.formatFieldName(field)} appears invalid`);
          }
          break;
      }
    }

    return errors;
  }

  /**
   * Normalize a provider configuration
   * - Ensures secure flag matches port (if applicable)
   * - Removes undefined optional fields
   * - Ensures all required fields are present (fills with defaults if needed)
   */
  static normalizeConfig(
    config: Record<string, any>,
    provider: EmailProvider
  ): Record<string, any> {
    const normalized = { ...config };

    // If provider supports secure connections, ensure flag is calculated correctly
    if (this.supportsSecure(provider) && 'port' in normalized) {
      normalized.secure = this.calculateSecureFromPort(normalized.port, provider);
    }

    // Normalize field names: user → username (for API)
    if ('user' in normalized && !('username' in normalized)) {
      normalized.username = normalized.user;
      // Keep 'user' for internal state, but API will use 'username'
    }

    // Clean up undefined optional fields
    for (const key in normalized) {
      if (normalized[key] === undefined || normalized[key] === null) {
        delete normalized[key];
      }
    }

    return normalized;
  }

  /**
   * Check if a password is masked (placeholder)
   * Masked passwords look like "****" or "***..."
   */
  static isMaskedPassword(password: string): boolean {
    if (!password || typeof password !== 'string') {
      return false;
    }
    return /^\*+$/.test(password);
  }

  /**
   * Get default configuration for a provider
   */
  static getDefaultConfig(provider: EmailProvider): Record<string, any> {
    const defaults: Record<EmailProvider, Record<string, any>> = {
      custom: {
        host: '',
        port: 587,
        user: '',
        password: '',
        fromEmail: '',
        fromName: 'Barangay System',
        secure: false,
      },
      mailtrap: {
        host: 'smtp.mailtrap.io',
        port: 2525,
        user: '',
        password: '',
        fromEmail: '',
        fromName: 'Barangay System',
        secure: false,
      },
      sendgrid: {
        apiKey: '',
        fromEmail: '',
        fromName: 'Barangay System',
      },
      gmail: {
        host: 'smtp.gmail.com',
        port: 465,
        user: '',
        password: '',
        fromEmail: '',
        fromName: 'Barangay System',
        secure: true,
      },
      'aws-ses': {
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsRegion: 'us-east-1',
        fromEmail: '',
        fromName: 'Barangay System',
      },
    };

    return { ...defaults[provider] };
  }

  /**
   * Format field name for display (e.g., 'fromEmail' → 'From Email')
   */
  static formatFieldName(fieldName: string): string {
    // Insert space before uppercase letters
    const spaced = fieldName.replace(/([A-Z])/g, ' $1');
    // Capitalize first letter
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
  }

  /**
   * Check if two ports likely represent the same connection type
   */
  static portIndicatesSecure(port: number): boolean {
    return this.calculateSecureFromPort(port) === true;
  }

  /**
   * Get validation errors summary as user-friendly message
   */
  static formatValidationErrors(errors: string[]): string {
    if (errors.length === 0) return '';
    return errors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
  }

  /**
   * Check if provider configuration is complete
   */
  static isConfigComplete(config: Record<string, any>, provider: EmailProvider): boolean {
    const errors = this.validateConfig(config, provider);
    return errors.length === 0;
  }
}

export default EmailProviderManager;
