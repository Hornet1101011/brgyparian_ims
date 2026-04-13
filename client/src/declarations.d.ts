declare module "*.json" {
  const value: any;
  export default value;
}

// Allow importing plain CSS files in TS without errors
declare module "*.css";

declare module 'antd';
declare module '@ant-design/icons';
declare module 'react-router-dom';
declare module '@mui/material';
