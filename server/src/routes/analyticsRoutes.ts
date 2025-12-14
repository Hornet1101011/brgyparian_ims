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
	getPersonalInfoRecords,
	getDocumentRequests,
	getProcessedDocumentsCount,
	getPendingRequestsCount
} from '../controllers/analyticsController';

const router = express.Router();

router.get('/', (req: any, res: Response, next?: NextFunction) => getMonthlyAnalytics(req, res, next));
router.get('/personal-info', (req: any, res: Response) => getPersonalInfoRecords(req, res));
router.get('/document-requests', (req: any, res: Response) => getDocumentRequests(req, res));
router.get('/processed-documents-count', (req: any, res: Response) => getProcessedDocumentsCount(req, res));
router.get('/pending-requests-count', (req: any, res: Response) => getPendingRequestsCount(req, res));
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

export default router;
