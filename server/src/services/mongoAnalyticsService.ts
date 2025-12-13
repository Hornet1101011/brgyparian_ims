/**
 * MongoDB Direct Analytics Service
 * Provides direct MongoDB collection access for analytics queries
 * Bypasses Mongoose for maximum performance on read-heavy analytics operations
 */

import { MongoClient, Db, Collection, Filter, AggregateOptions } from 'mongodb';

interface MongoConnectionOptions {
  uri?: string;
  dbName?: string;
  connectTimeoutMS?: number;
  serverSelectionTimeoutMS?: number;
}

interface AnalyticsResult {
  success: boolean;
  data?: any;
  total?: number;
  error?: string;
  timestamp: string;
}

class MongoAnalyticsService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly mongoUri: string;
  private readonly dbName: string;
  private readonly connectTimeout: number;

  constructor(options: MongoConnectionOptions = {}) {
    this.mongoUri = options.uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/barangay-system';
    this.dbName = options.dbName || 'barangay-system';
    this.connectTimeout = options.connectTimeoutMS || 5000;
  }

  /**
   * Establish connection to MongoDB
   */
  async connect(): Promise<void> {
    // Return existing connection if already connected
    if (this.db) {
      return;
    }

    // Return existing promise if connection in progress
    if (this.connectPromise) {
      return this.connectPromise;
    }

    // Create new connection promise
    this.connectPromise = (async () => {
      try {
        console.log('Connecting to MongoDB for analytics...');
        this.client = new MongoClient(this.mongoUri, {
          connectTimeoutMS: this.connectTimeout,
          serverSelectionTimeoutMS: this.connectTimeout,
          socketTimeoutMS: 30000,
        });

        await this.client.connect();
        this.db = this.client.db(this.dbName);
        
        // Test connection
        await this.db.command({ ping: 1 });
        console.log('MongoDB analytics connection established');
      } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        this.connectPromise = null;
        throw error;
      }
    })();

    return this.connectPromise;
  }

  /**
   * Get residents collection
   */
  private async getResidentsCollection(): Promise<Collection> {
    await this.connect();
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection('residents');
  }

  /**
   * Get document requests collection
   */
  private async getDocumentRequestsCollection(): Promise<Collection> {
    await this.connect();
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection('documentrequests');
  }

  /**
   * Get inquiries collection
   */
  private async getInquiriesCollection(): Promise<Collection> {
    await this.connect();
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection('inquiries');
  }

  /**
   * Close connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.connectPromise = null;
      console.log('MongoDB analytics connection closed');
    }
  }

  // ========================================================================
  // RESIDENTS COLLECTION QUERIES
  // ========================================================================

  /**
   * Get total resident count
   */
  async getTotalResidents(filter?: Filter<any>): Promise<number> {
    try {
      const collection = await this.getResidentsCollection();
      const count = await collection.countDocuments(filter || {});
      return count;
    } catch (error) {
      console.error('Error getting total residents:', error);
      throw error;
    }
  }

  /**
   * Get gender distribution
   */
  async getGenderDistribution(filter?: Filter<any>): Promise<AnalyticsResult> {
    try {
      const collection = await this.getResidentsCollection();
      const pipeline = [
        ...(filter ? [{ $match: filter }] : []),
        {
          $group: {
            _id: {
              $cond: [
                { $eq: [{ $toLower: { $substr: ['$sex', 0, 1] } }, 'm'] },
                'Male',
                {
                  $cond: [
                    { $eq: [{ $toLower: { $substr: ['$sex', 0, 1] } }, 'f'] },
                    'Female',
                    'Other'
                  ]
                }
              ]
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $project: { type: '$_id', value: '$count', _id: 0 } }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      const total = results.reduce((sum: number, r: any) => sum + r.value, 0);

      return {
        success: true,
        data: results,
        total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting gender distribution:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get age distribution with bucketing
   */
  async getAgeDistribution(filter?: Filter<any>): Promise<AnalyticsResult> {
    try {
      const collection = await this.getResidentsCollection();
      const pipeline = [
        ...(filter ? [{ $match: filter }] : []),
        {
          $group: {
            _id: {
              $cond: [
                { $lte: [{ $toInt: '$age' }, 18] },
                '0-18',
                {
                  $cond: [
                    { $lte: [{ $toInt: '$age' }, 35] },
                    '19-35',
                    {
                      $cond: [
                        { $lte: [{ $toInt: '$age' }, 60] },
                        '36-60',
                        '60+'
                      ]
                    }
                  ]
                }
              ]
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            type: '$_id',
            value: '$count',
            _id: 0
          }
        },
        { $sort: { type: 1 } }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      const total = results.reduce((sum: number, r: any) => sum + r.value, 0);

      return {
        success: true,
        data: results,
        total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting age distribution:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get field distribution (generic for any string field)
   */
  async getFieldDistribution(fieldName: string, filter?: Filter<any>): Promise<AnalyticsResult> {
    try {
      const collection = await this.getResidentsCollection();
      const pipeline = [
        { $match: { [fieldName]: { $exists: true, $ne: null } } },
        ...(filter ? [{ $match: filter }] : []),
        {
          $group: {
            _id: {
              $toLower: {
                $trim: {
                  input: { $toString: `$${fieldName}` }
                }
              }
            },
            count: { $sum: 1 }
          }
        },
        { $match: { _id: { $ne: '' } } },
        { $sort: { count: -1 } },
        {
          $project: {
            type: {
              $concat: [
                { $toUpper: { $substr: ['$_id', 0, 1] } },
                { $substr: ['$_id', 1, -1] }
              ]
            },
            value: '$count',
            _id: 0
          }
        }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      const total = results.reduce((sum: number, r: any) => sum + r.value, 0);

      return {
        success: true,
        data: results,
        total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error getting ${fieldName} distribution:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get residents with all personal info
   */
  async getResidents(filter?: Filter<any>, limit: number = 1000): Promise<AnalyticsResult> {
    try {
      const collection = await this.getResidentsCollection();
      const residents = await collection
        .find(filter || {})
        .limit(limit)
        .toArray();

      return {
        success: true,
        data: residents,
        total: residents.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting residents:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // ========================================================================
  // DOCUMENT REQUESTS COLLECTION QUERIES
  // ========================================================================

  /**
   * Get total document request count
   */
  async getTotalDocumentRequests(filter?: Filter<any>): Promise<number> {
    try {
      const collection = await this.getDocumentRequestsCollection();
      const count = await collection.countDocuments(filter || {});
      return count;
    } catch (error) {
      console.error('Error getting total document requests:', error);
      throw error;
    }
  }

  /**
   * Get document request distribution by type
   */
  async getDocumentTypeDistribution(filter?: Filter<any>): Promise<AnalyticsResult> {
    try {
      const collection = await this.getDocumentRequestsCollection();
      const pipeline = [
        ...(filter ? [{ $match: filter }] : []),
        {
          $group: {
            _id: {
              $toLower: {
                $trim: {
                  input: { $toString: { $ifNull: ['$documentType', 'Unknown'] } }
                }
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        {
          $project: {
            type: '$_id',
            value: '$count',
            _id: 0
          }
        }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      const total = results.reduce((sum: number, r: any) => sum + r.value, 0);

      return {
        success: true,
        data: results,
        total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting document type distribution:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get document requests by status
   */
  async getDocumentsByStatus(filter?: Filter<any>): Promise<AnalyticsResult> {
    try {
      const collection = await this.getDocumentRequestsCollection();
      const pipeline = [
        ...(filter ? [{ $match: filter }] : []),
        {
          $group: {
            _id: {
              $toLower: {
                $trim: {
                  input: { $toString: { $ifNull: ['$status', 'Unknown'] } }
                }
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        {
          $project: {
            type: '$_id',
            value: '$count',
            _id: 0
          }
        }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      const total = results.reduce((sum: number, r: any) => sum + r.value, 0);

      return {
        success: true,
        data: results,
        total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting document status distribution:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get document requests with all details
   */
  async getDocumentRequests(filter?: Filter<any>, limit: number = 1000): Promise<AnalyticsResult> {
    try {
      const collection = await this.getDocumentRequestsCollection();
      const documents = await collection
        .find(filter || {})
        .limit(limit)
        .toArray();

      return {
        success: true,
        data: documents,
        total: documents.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting document requests:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // ========================================================================
  // SUMMARY QUERIES
  // ========================================================================

  /**
   * Get dashboard summary statistics
   */
  async getDashboardSummary(): Promise<AnalyticsResult> {
    try {
      const residentsCollection = await this.getResidentsCollection();
      const documentsCollection = await this.getDocumentRequestsCollection();

      const [totalResidents, totalDocuments, genderDist, ageDist] = await Promise.all([
        residentsCollection.countDocuments({}),
        documentsCollection.countDocuments({}),
        this.getGenderDistribution(),
        this.getAgeDistribution()
      ]);

      return {
        success: true,
        data: {
          totalResidents: totalResidents,
          totalDocuments: totalDocuments,
          genderDistribution: genderDist.data,
          ageDistribution: ageDist.data
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting dashboard summary:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
let serviceInstance: MongoAnalyticsService | null = null;

export function getMongoAnalyticsService(options?: MongoConnectionOptions): MongoAnalyticsService {
  if (!serviceInstance) {
    serviceInstance = new MongoAnalyticsService(options);
  }
  return serviceInstance;
}

export default MongoAnalyticsService;
