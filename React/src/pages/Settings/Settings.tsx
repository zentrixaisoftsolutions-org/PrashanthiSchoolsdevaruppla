import React, { useState } from 'react';
import ClassNames from '../ClassNames/ClassNames';
import Sections from '../Sections/Sections';
import ClassSections from '../ClassSections/ClassSections';

type SettingsSection = 'class-names' | 'sections' | 'class-sections';

interface SubMenuItem {
  id: SettingsSection;
  label: string;
  icon: string;
  description: string;
}

const Settings: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('class-names');

  const subMenuItems: SubMenuItem[] = [
    { 
      id: 'class-names', 
      label: 'Class Names', 
      icon: '🏫',
      description: 'Manage class names (Class 1, Class 2, etc.)'
    },
    { 
      id: 'sections', 
      label: 'Section Names', 
      icon: '📋',
      description: 'Manage section names (A, B, Lily, Rose, etc.)'
    },
    { 
      id: 'class-sections', 
      label: 'Class-Section Mapping', 
      icon: '🔗',
      description: 'Assign sections to classes'
    },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'class-names':
        return <ClassNames />;
      case 'sections':
        return <Sections />;
      case 'class-sections':
        return <ClassSections />;
      default:
        return <ClassNames />;
    }
  };

  return (
    <div className="flex h-full -m-6">
      {/* Left Panel - Settings Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            ⚙️ Settings
          </h2>
          <p className="text-xs text-gray-500 mt-1">System configuration</p>
        </div>
        
        <nav className="p-2">
          <div className="mb-4">
            <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Classes & Sections
            </h3>
            <ul className="space-y-1">
              {subMenuItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                      activeSection === item.id
                        ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      {activeSection === item.id && (
                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Future sections can be added here */}
          {/* 
          <div className="mb-4">
            <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Academic Year
            </h3>
            <ul className="space-y-1">
              ...
            </ul>
          </div>
          */}
        </nav>
      </div>

      {/* Right Panel - Content */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {renderContent()}
      </div>
    </div>
  );
};

export default Settings;
