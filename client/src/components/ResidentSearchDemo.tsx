import React, { useState } from 'react';
import { Button, Card, Space, Typography, Alert, Divider } from 'antd';
import { FilterOutlined, UserOutlined } from '@ant-design/icons';
import ResidentSelectionModal from './ResidentSelectionModal';

const { Title, Text, Paragraph } = Typography;

interface Resident {
  _id: string;
  barangayID: string;
  firstName: string;
  lastName: string;
  // ... other resident fields
}

const ResidentSearchDemo: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [selectedResidents, setSelectedResidents] = useState<Resident[]>([]);

  const handleSingleSelect = (resident: Resident) => {
    setSelectedResident(resident);
    console.log('Selected resident:', resident);
  };

  const handleMultiSelect = (residents: Resident[]) => {
    setSelectedResidents(residents);
    console.log('Selected residents:', residents);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card>
        <Title level={2}>
          <UserOutlined /> Advanced Resident Search Demo
        </Title>
        
        <Paragraph>
          This demo showcases the new advanced filtering system for searching residents. 
          The system includes comprehensive filtering options and a user-friendly interface.
        </Paragraph>

        <Divider />

        <Title level={4}>Features</Title>
        <ul>
          <li><strong>Basic Text Search:</strong> Search across names, IDs, contact info, address, and occupation</li>
          <li><strong>Advanced Filters:</strong> Filter by age, sex, civil status, nationality, religion, blood type, occupation, education, and more</li>
          <li><strong>Business Information:</strong> Filter residents by business ownership</li>
          <li><strong>Residency Filters:</strong> Filter by date of residency range</li>
          <li><strong>Sorting Options:</strong> Sort by various fields in ascending or descending order</li>
          <li><strong>Active Filter Display:</strong> See all applied filters with easy removal options</li>
          <li><strong>Pagination:</strong> Navigate through large result sets efficiently</li>
        </ul>

        <Divider />

        <Title level={4}>Try It Out</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message="Demo Mode"
            description="Click the buttons below to test the resident search functionality. The advanced filtering modal provides comprehensive search options."
            type="info"
            showIcon
          />

          <Space wrap>
            <Button
              type="primary"
              icon={<FilterOutlined />}
              onClick={() => setShowModal(true)}
            >
              Single Resident Selection
            </Button>
            
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowModal(true)}
            >
              Multiple Resident Selection
            </Button>
          </Space>

          {selectedResident && (
            <Card size="small" title="Selected Resident (Single)">
              <Text>{selectedResident.firstName} {selectedResident.lastName}</Text>
              <br />
              <Text type="secondary">ID: {selectedResident.barangayID}</Text>
            </Card>
          )}

          {selectedResidents.length > 0 && (
            <Card size="small" title={`Selected Residents (${selectedResidents.length})`}>
              {selectedResidents.map((resident, index) => (
                <div key={resident._id}>
                  <Text>{index + 1}. {resident.firstName} {resident.lastName}</Text>
                  <Text type="secondary"> - {resident.barangayID}</Text>
                </div>
              ))}
            </Card>
          )}
        </Space>

        <Divider />

        <Title level={4}>Usage Instructions</Title>
        <ol>
          <li><strong>Basic Search:</strong> Enter text in the search box to find residents by name, ID, contact info, address, or occupation</li>
          <li><strong>Advanced Filters:</strong> Click "Advanced Filters" to open the comprehensive filtering modal</li>
          <li><strong>Apply Filters:</strong> Select desired filter options and click "Apply Filters"</li>
          <li><strong>View Results:</strong> Browse through filtered results with pagination</li>
          <li><strong>Active Filters:</strong> See applied filters as tags below the search bar - click X to remove individual filters</li>
          <li><strong>Select Residents:</strong> Click on a resident to select them (or check/uncheck for multi-select mode)</li>
        </ol>

        <Title level={4}>Available Filter Options</Title>
        <ul>
          <li><strong>Personal:</strong> Age range, sex, civil status, nationality, religion, blood type, disability status, single parent status</li>
          <li><strong>Professional:</strong> Occupation, educational attainment, business ownership</li>
          <li><strong>Residency:</strong> Date of residency range</li>
          <li><strong>Sorting:</strong> By last name, first name, barangay ID, age, date of residency, or occupation</li>
        </ul>
      </Card>

      <ResidentSelectionModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onResidentSelect={handleSingleSelect}
        title="Search and Select Residents"
        multiSelect={false}
        selectedResidents={selectedResidents}
      />
    </div>
  );
};

export default ResidentSearchDemo;
