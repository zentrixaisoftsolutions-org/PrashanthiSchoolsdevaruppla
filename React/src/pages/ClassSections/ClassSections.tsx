import React, { useEffect, useState } from 'react';
import classSectionService, { ClassWithSections, ClassSection } from '../../services/classSectionService';
import classNameService, { ClassName } from '../../services/classNameService';
import sectionService, { Section } from '../../services/sectionService';

const ClassSections: React.FC = () => {
  const [classesWithSections, setClassesWithSections] = useState<ClassWithSections[]>([]);
  const [allClassNames, setAllClassNames] = useState<ClassName[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassName | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
  const [capacity, setCapacity] = useState(50);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12; // Show 12 classes per page (4x3 grid)

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [classesData, classNamesData, sectionsData] = await Promise.all([
        classSectionService.listClassesWithSections(),
        classNameService.listClassNames(),
        sectionService.listSections()
      ]);
      setClassesWithSections(classesData);
      setAllClassNames(classNamesData);
      setAllSections(sectionsData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignModal = (className: ClassName) => {
    setSelectedClass(className);
    // Get currently assigned section IDs for this class
    const classWithSections = classesWithSections.find(c => c.id === className.id);
    const assignedIds = classWithSections?.sections.map(s => s.id) || [];
    setSelectedSectionIds(assignedIds);
    setCapacity(50);
    setShowModal(true);
  };

  const handleSectionToggle = (sectionId: number) => {
    setSelectedSectionIds(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleSaveAssignments = async () => {
    if (!selectedClass) return;
    
    try {
      // Get current mappings for this class
      const currentMappings = await classSectionService.listClassSections(selectedClass.id);
      const currentSectionIds = currentMappings.map(m => m.section_id);
      
      // Find sections to add
      const toAdd = selectedSectionIds.filter(id => !currentSectionIds.includes(id));
      
      // Find mappings to remove
      const toRemove = currentMappings.filter(m => !selectedSectionIds.includes(m.section_id));
      
      // Add new sections
      if (toAdd.length > 0) {
        await classSectionService.bulkAssignSections({
          class_name_id: selectedClass.id,
          section_ids: toAdd,
          capacity: capacity
        });
      }
      
      // Remove unselected sections
      for (const mapping of toRemove) {
        await classSectionService.deleteClassSection(mapping.id);
      }
      
      setShowModal(false);
      setSelectedClass(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save assignments');
    }
  };

  const handleRemoveSection = async (classId: number, sectionId: number) => {
    if (!window.confirm('Are you sure you want to remove this section from the class?')) return;
    
    try {
      const mappings = await classSectionService.listClassSections(classId);
      const mapping = mappings.find(m => m.section_id === sectionId);
      if (mapping) {
        await classSectionService.deleteClassSection(mapping.id);
        fetchData();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove section');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Class-Section Mapping</h1>
          <p className="text-gray-600 mt-1">
            Assign sections (like Lily, Rose, Daffodil) to each class • 
            Total: {allClassNames.length} classes
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Pagination info */}
      {allClassNames.length > pageSize && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, allClassNames.length)} of {allClassNames.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.ceil(allClassNames.length / pageSize) }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 text-sm rounded ${
                  currentPage === page
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(allClassNames.length / pageSize), p + 1))}
              disabled={currentPage >= Math.ceil(allClassNames.length / pageSize)}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allClassNames
          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
          .map((className) => {
          const classWithSections = classesWithSections.find(c => c.id === className.id);
          const sections = classWithSections?.sections || [];
          
          return (
            <div key={className.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{className.name}</h3>
                <button
                  onClick={() => handleOpenAssignModal(className)}
                  className="text-white hover:text-indigo-200 text-sm flex items-center gap-1"
                >
                  <span>+</span> Manage
                </button>
              </div>
              <div className="p-4">
                {sections.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No sections assigned</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sections.map((section) => (
                      <span
                        key={section.id}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                      >
                        {section.name}
                        <button
                          onClick={() => handleRemoveSection(className.id, section.id)}
                          className="ml-1 text-indigo-600 hover:text-red-600"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
                {sections.length} section{sections.length !== 1 ? 's' : ''} assigned
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom pagination */}
      {allClassNames.length > pageSize && (
        <div className="flex items-center justify-center mt-6 gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {currentPage} of {Math.ceil(allClassNames.length / pageSize)}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(Math.ceil(allClassNames.length / pageSize), p + 1))}
            disabled={currentPage >= Math.ceil(allClassNames.length / pageSize)}
            className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}

      {allClassNames.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No classes found. Please add class names first.
        </div>
      )}

      {showModal && selectedClass && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModal(false)}></div>
            <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-auto p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Assign Sections to {selectedClass.name}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Select the sections you want to assign to this class
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Capacity per Section</label>
                <input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 50)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {allSections.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No sections available. Please add sections first.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {allSections.map((section) => (
                      <label
                        key={section.id}
                        className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSectionIds.includes(section.id)}
                          onChange={() => handleSectionToggle(section.id)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-900">{section.name}</span>
                        {section.description && (
                          <span className="ml-2 text-xs text-gray-500">({section.description})</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setSelectedClass(null); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAssignments}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Save Assignments
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassSections;
