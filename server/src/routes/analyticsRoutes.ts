import express, { Request, Response, NextFunction } from 'express';
import {
	getMonthlyAnalytics,
	getGenderDistribution,
	getFieldDistribution,
	getAgeBuckets,
	getOccupationDistribution,
	getNationalityDistribution,
	getBloodTypeDistribution,
	getDisabilityDistribution,
	getChildrenCountDistribution,
	getBusinessTypeDistribution,
	getBusinessSizeDistribution,
	getIncomeBrackets,
	getEducationDistribution,
	getCivilStatusDistribution,
	getReligionDistribution,
	getPersonalInfoRecords,
	getDocumentRequests,
	getDocumentTypeDistribution,
	getDocumentsByStatus,
	getDashboardSummary
} from '../controllers/analyticsController';

const router = express.Router();

// Summary endpoints
router.get('/', (req: any, res: Response) => getMonthlyAnalytics(req, res));
router.get('/dashboard-summary', (req: any, res: Response) => getDashboardSummary(req, res));

// Personal info and document requests (raw data)
router.get('/personal-info', (req: any, res: Response) => getPersonalInfoRecords(req, res));
router.get('/document-requests', (req: any, res: Response) => getDocumentRequests(req, res));

// Resident demographics
router.get('/gender', (req: any, res: Response) => getGenderDistribution(req, res));
router.get('/field', (req: any, res: Response) => getFieldDistribution(req, res));
router.get('/age', (req: any, res: Response) => getAgeBuckets(req, res));
router.get('/occupation', (req: any, res: Response) => getOccupationDistribution(req, res));
router.get('/nationality', (req: any, res: Response) => getNationalityDistribution(req, res));
router.get('/blood-type', (req: any, res: Response) => getBloodTypeDistribution(req, res));
router.get('/disability', (req: any, res: Response) => getDisabilityDistribution(req, res));
router.get('/children-count', (req: any, res: Response) => getChildrenCountDistribution(req, res));
router.get('/business-type', (req: any, res: Response) => getBusinessTypeDistribution(req, res));
router.get('/business-size', (req: any, res: Response) => getBusinessSizeDistribution(req, res));
router.get('/income-brackets', (req: any, res: Response) => getIncomeBrackets(req, res));
router.get('/education', (req: any, res: Response) => getEducationDistribution(req, res));
router.get('/civil-status', (req: any, res: Response) => getCivilStatusDistribution(req, res));
router.get('/religion', (req: any, res: Response) => getReligionDistribution(req, res));

// Document analytics
router.get('/document-types', (req: any, res: Response) => getDocumentTypeDistribution(req, res));
router.get('/document-status', (req: any, res: Response) => getDocumentsByStatus(req, res));

export default router;
