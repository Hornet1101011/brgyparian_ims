/**
 * Analytics Controller - Revised to use Direct MongoDB Connection
 * All analytics queries now use direct MongoDB driver for optimal performance
 */

import { Request, Response } from 'express';
import { getMongoAnalyticsService } from '../services/mongoAnalyticsService';
import { Filter } from 'mongodb';

// Helper to build date filter
const buildDateFilter = (startDate?: string, endDate?: string): Filter<any> | undefined => {
  if (!startDate || !endDate) return undefined;
  return {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };
};

/**
 * Get monthly analytics for the current year
 */
export const getMonthlyAnalytics = async (req: Request, res: Response) => {
  try {
    const mongoService = getMongoAnalyticsService();
    const summary = await mongoService.getDashboardSummary();

    if (!summary.success) {
      return res.status(500).json({ message: 'Error fetching monthly analytics', error: summary.error });
    }

    res.json({
      year: new Date().getFullYear(),
      summary: summary.data,
      timestamp: summary.timestamp
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getGenderDistribution(filter);
    res.json(result);
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
    const mongoService = getMongoAnalyticsService();
    const field = (req.query.field || '').toString().trim();
    
    if (!field) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required field parameter' 
      });
    }

    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution(field, filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getAgeDistribution(filter);
    res.json(result);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('occupation', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('nationality', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('bloodType', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('disabilityStatus', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('numberOfChildren', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('businessType', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('numberOfEmployees', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('annualGrossIncome', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('educationLevel', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('civilStatus', filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getFieldDistribution('religion', filter);
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
  try {
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate, barangayID, residentType, limit = 10000 } = req.query;

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

    console.log('Fetching personal info with filter:', filter);
    const result = await mongoService.getResidents(filter, parseInt(limit as string) || 10000);
    
    // Return normalized response format
    res.json({
      data: result.data || [],
      total: result.total || 0,
      success: result.success,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error fetching personal info records:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching personal info records',
      error: errorMsg,
      details: error instanceof Error ? error.stack : undefined
    });
  }
};

/**
 * Get document request records for analytics
 * Returns all document requests for client-side analytics computation
 */
export const getDocumentRequests = async (req: Request, res: Response) => {
  try {
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate, limit = 10000 } = req.query;

    const filter: any = {};

    // Add date range if provided
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    console.log('Fetching document requests with filter:', filter);
    const result = await mongoService.getDocumentRequests(filter, parseInt(limit as string) || 10000);
    
    // Return normalized response format
    res.json({
      data: result.data || [],
      total: result.total || 0,
      success: result.success,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error fetching document requests:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document requests',
      error: errorMsg,
      details: error instanceof Error ? error.stack : undefined
    });
  }
};

/**
 * Get document type distribution
 */
export const getDocumentTypeDistribution = async (req: Request, res: Response) => {
  try {
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getDocumentTypeDistribution(filter);
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
    const mongoService = getMongoAnalyticsService();
    const { startDate, endDate } = req.query;
    const filter = buildDateFilter(startDate as string, endDate as string);

    const result = await mongoService.getDocumentsByStatus(filter);
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
    const mongoService = getMongoAnalyticsService();
    const result = await mongoService.getDashboardSummary();
    res.json(result);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching dashboard summary', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
