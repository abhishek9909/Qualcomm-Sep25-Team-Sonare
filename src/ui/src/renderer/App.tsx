import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import CameraCapture from './CameraCapture';
import SimpleCameraScreen from './SimpleCameraScreen';

function Hello() {
  return (
    <div>
      <div className="Hello">
        <img width="200" alt="icon" src={icon} />
      </div>
      <h1>electron-react-boilerplate</h1>
      {/* CameraCapture button and view will be shown below */}
      <CameraCapture />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Hello />} />
          <Route path="/camera" element={<SimpleCameraScreen />} />
        </Routes>
      </div>
    </Router>
  );
}
