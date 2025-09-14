import React from 'react';
import { useNavigate } from 'react-router-dom';

function CameraCapture(): React.ReactElement {
  const navigate = useNavigate();

  const openCameraScreen = () => {
    navigate('/camera');
  };

  return (
    <div className="camera-capture">
      <button
        type="button"
        onClick={openCameraScreen}
        className="camera-button"
      >
        📷 Open Front Camera
      </button>
      <p>Click the button above to open the camera in a new screen</p>
    </div>
  );
}

export default CameraCapture;
