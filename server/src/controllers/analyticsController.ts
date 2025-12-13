/**
 * Analytics Controller - Using Mongoose Models
 * All analytics queries use Mongoose models for optimal reliability with existing connection
 */

import { Request, Response } from 'express';
import { Resident } from '../models/Resident';
import { DocumentRequest } from '../models/DocumentRequest';

// Helper to build date filter
const buildDateFilter = (startDate?: string, endDate?: string): Record<string, any> | undefined => {
  if (!startDate || !endDate) return undefined;
  return {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };
};

// Helper to aggregate field distribution
const aggregateFieldDistribution = async (model: any, field: string, filter?: Record<string, any>) => {
  try {
    const result = await model.aggregate([
      ...(filter ? [{ $match: filter }] : []),
      {
        $group: {
          _id: `$${field}`,
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $project: { value: '$_id', count: '$count', _id: 0 } }
    ]);

    return {
      success: true,
      data: result,
      total: result.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error aggregating ${field}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Get monthly analytics for the current year
 */
export const getMonthlyAnalytics = async (req: Request, res: Response) => {
  try {
    const totalResidents = await Resident.countDocuments();
    const totalDocuments = await DocumentRequest.countDocuments();
    
    res.json({
      year: new Date().getFullYear(),
      summary: {
        totalResidents,
        totalDocuments,
        activeResidents: totalResidents
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching monthly analytics:', error);
    res.status(500).json({ message: 'Error fetching analytics', error });
  }
};

/**
 * Get gender distribution from residents
 */
export const getGenderDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string) || {};

    const result = await Resident.aggregate([
      { $match: filter },
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
    ]);

    res.json({
      success: true,
      data: result,
      total: result.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching gender distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching gender distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get field distribution (generic endpoint)
 */
export const getFieldDistribution = async (req: Request, res: Response) => {
  try {
    const field = (req.query.field || '').toString().trim();
    
    if (!field) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required field parameter' 
      });
    }

    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, field, filter);
    res.json(result);
  } catch (error) {
    console.error('Error fetching field distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching field distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get age distribution with bucketing
 */
export const getAgeBuckets = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string) || {};

    const result = await Resident.aggregate([
      { $match: filter },
      {
        $bucket: {
          groupBy: '$age',
          boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150],
          default: 'Unknown',
          output: {
            count: { $sum: 1 }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: result,
      total: result.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching age buckets:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching age buckets', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get occupation distribution
 */
export const getOccupationDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'occupation', filter);
    res.json({ field: 'occupation', ...result });
  } catch (error) {
    console.error('Error fetching occupation distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching occupation distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get nationality distribution
 */
export const getNationalityDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'nationality', filter);
    res.json({ field: 'nationality', ...result });
  } catch (error) {
    console.error('Error fetching nationality distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching nationality distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get blood type distribution
 */
export const getBloodTypeDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'bloodType', filter);
    res.json({ field: 'bloodType', ...result });
  } catch (error) {
    console.error('Error fetching blood type distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching blood type distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get disability distribution
 */
export const getDisabilityDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'disabilityStatus', filter);
    res.json({ field: 'disabilityStatus', ...result });
  } catch (error) {
    console.error('Error fetching disability distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching disability distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get children count distribution
 */
export const getChildrenCountDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'numberOfChildren', filter);
    res.json({ field: 'numberOfChildren', ...result });
  } catch (error) {
    console.error('Error fetching children count distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching children count distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get business type distribution
 */
export const getBusinessTypeDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'businessType', filter);
    res.json({ field: 'businessType', ...result });
  } catch (error) {
    console.error('Error fetching business type distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching business type distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get business size distribution
 */
export const getBusinessSizeDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'numberOfEmployees', filter);
    res.json({ field: 'numberOfEmployees', ...result });
  } catch (error) {
    console.error('Error fetching business size distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching business size distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get income brackets distribution
 */
export const getIncomeBrackets = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'annualGrossIncome', filter);
    res.json({ field: 'annualGrossIncome', ...result });
  } catch (error) {
    console.error('Error fetching income brackets:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching income brackets', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get education distribution
 */
export const getEducationDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'educationLevel', filter);
    res.json({ field: 'educationLevel', ...result });
  } catch (error) {
    console.error('Error fetching education distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching education distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get civil status (marital status) distribution
 */
export const getCivilStatusDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'civilStatus', filter);
    res.json({ field: 'civilStatus', ...result });
  } catch (error) {
    console.error('Error fetching civil status distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching civil status distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get religion distribution
 */
export const getReligionDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(Resident, 'religion', filter);
    res.json({ field: 'religion', ...result });
  } catch (error) {
    console.error('Error fetching religion distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching religion distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get personal info records for analytics
 * Returns all resident data for client-side analytics computation
 */
export const getPersonalInfoRecords = async (req: Request, res: Response) => {
  console.log('📊 [Analytics] getPersonalInfoRecords called');
  try {
    const { startDate, endDate, barangayID, residentType, limit = 10000 } = req.query;
    console.log('📊 [Analytics] Query params:', { startDate, endDate, barangayID, residentType, limit });

    const filter: any = {};

    // Add date range if provided
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    // Add barangay filter if provided
    if (barangayID) {
      filter.barangayID = barangayID;
    }

    // Add resident type filter if provided
    if (residentType) {
      filter.residentType = residentType;
    }

    console.log('📊 [Analytics] Using filter:', filter);
    const residents = await Resident.find(filter)
      .limit(parseInt(limit as string) || 10000)
      .lean()
      .exec();
    
    console.log('📊 [Analytics] Found residents:', residents.length);
    
    // Return normalized response format
    res.json({
      data: residents || [],
      total: residents.length || 0,
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [Analytics] Error fetching personal info records:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ [Analytics] Full error stack:', error instanceof Error ? error.stack : error);
    res.status(500).json({
      success: false,
      message: 'Error fetching personal info records',
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
};

/**
 * Get document request records for analytics
 * Returns all document requests for client-side analytics computation
 */
export const getDocumentRequests = async (req: Request, res: Response) => {
  console.log('📊 [Analytics] getDocumentRequests called');
  try {
    const { startDate, endDate, limit = 10000 } = req.query;
    console.log('📊 [Analytics] Query params:', { startDate, endDate, limit });

    const filter: any = {};

    // Add date range if provided
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    console.log('📊 [Analytics] Using filter:', filter);
    const documents = await DocumentRequest.find(filter)
      .limit(parseInt(limit as string) || 10000)
      .lean()
      .exec();
    
    console.log('📊 [Analytics] Found documents:', documents.length);
    
    // Return normalized response format
    res.json({
      data: documents || [],
      total: documents.length || 0,
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [Analytics] Error fetching document requests:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ [Analytics] Full error stack:', error instanceof Error ? error.stack : error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document requests',
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
};

/**
 * Get document type distribution
 */
export const getDocumentTypeDistribution = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(DocumentRequest, 'documentType', filter);
    res.json(result);
  } catch (error) {
    console.error('Error fetching document type distribution:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching document type distribution', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get document requests by status
 */
export const getDocumentsByStatus = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await aggregateFieldDistribution(DocumentRequest, 'status', filter);
    res.json(result);
  } catch (error) {
    console.error('Error fetching documents by status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching documents by status', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get dashboard summary
 */
export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const totalResidents = await Resident.countDocuments();
    const totalDocuments = await DocumentRequest.countDocuments();
    const pendingDocuments = await DocumentRequest.countDocuments({ status: 'pending' });
    const approvedDocuments = await DocumentRequest.countDocuments({ status: 'approved' });

    res.json({
      success: true,
      data: {
        totalResidents,
        totalDocuments,
        pendingDocuments,
        approvedDocuments,
        rejectedDocuments: totalDocuments - approvedDocuments - pendingDocuments
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching dashboard summary', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
