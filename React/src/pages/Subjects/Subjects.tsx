import React, { useEffect, useState } from 'react';
import subjectService, { Subject, SubjectCreateRequest } from '../../services/subjectService';
import classSectionService, { ClassSection } from '../../services/classSectionService';

interface ClassGroup {
  class_name: string;
  sections: { id: number; section_name: string }[];
}

const Subjects: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<SubjectCreateRequest>({
    name: '',
    code: '',
    description: '',
  });
  const [selectedClassSections, setSelectedClassSections] = useState<number[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subjectsData, classSectionsData] = await Promise.all([
        subjectService.listSubjects(),
        classSectionService.listClassSections()
      ]);
      setSubjects(subjectsData);
      setClassSections(classSectionsData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Group class sections by class name for hierarchical display
  const getGroupedClasses = (): ClassGroup[] => {
    const grouped: { [key: string]: { id: number; section_name: string }[] } = {};
    
    classSections.forEach(cs => {
      if (!grouped[cs.class_name]) {
        grouped[cs.class_name] = [];
      }
      grouped[cs.class_name].push({ id: cs.id, section_name: cs.section_name });
    });

    return Object.entries(grouped).map(([class_name, sections]) => ({
      class_name,
      sections
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      // Create subject
      const newSubject = await subjectService.createSubject(formData);
      
      // Assign class sections
      if (selectedClassSections.length > 0) {
        await subjectService.assignClassSections(newSubject.id, selectedClassSections);
      }
      
      setShowModal(false);
      resetForm();
      setSuccess('Subject created successfully!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create subject');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    try {
      setSaving(true);
      // Update subject
      await subjectService.updateSubject(editingSubject.id, {
        name: formData.name,
        description: formData.description,
      });
      
      // Update class sections
      await subjectService.assignClassSections(editingSubject.id, selectedClassSections);
      
      setShowModal(false);
      setEditingSubject(null);
      resetForm();
      setSuccess('Subject updated successfully!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update subject');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    try {
      await subjectService.deleteSubject(id);
      setSuccess('Subject deleted successfully!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete subject');
    }
  };

  const openEditModal = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({
      name: subject.name,
      code: subject.code,
      description: subject.description || '',
    });
    // Set selected class sections from subject
    const selectedIds = subject.class_sections?.map(cs => cs.id) || [];
    setSelectedClassSections(selectedIds);
    setShowModal(true);
  };

  const openCreateModal = () => {
    resetForm();
    setEditingSubject(null);
    setSelectedClassSections([]);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', description: '' });
    setSelectedClassSections([]);
  };

  // Check if all sections of a class are selected
  const isClassFullySelected = (className: string): boolean => {
    const classSectionsForClass = classSections.filter(cs => cs.class_name === className);
    return classSectionsForClass.every(cs => selectedClassSections.includes(cs.id));
  };

  // Check if some sections of a class are selected (for indeterminate state)
  const isClassPartiallySelected = (className: string): boolean => {
    const classSectionsForClass = classSections.filter(cs => cs.class_name === className);
    const selectedCount = classSectionsForClass.filter(cs => selectedClassSections.includes(cs.id)).length;
    return selectedCount > 0 && selectedCount < classSectionsForClass.length;
  };

  const isAllClassesSelected = (): boolean =>
    classSections.length > 0 && classSections.every(cs => selectedClassSections.includes(cs.id));

  const isAllClassesPartiallySelected = (): boolean => {
    const count = classSections.filter(cs => selectedClassSections.includes(cs.id)).length;
    return count > 0 && count < classSections.length;
  };

  const toggleAllClasses = () => {
    if (isAllClassesSelected()) {
      setSelectedClassSections([]);
    } else {
      setSelectedClassSections(classSections.map(cs => cs.id));
    }
  };

  // Toggle all sections of a class
  const toggleClass = (className: string) => {
    const classSectionsForClass = classSections.filter(cs => cs.class_name === className);
    const allSelected = isClassFullySelected(className);
    
    if (allSelected) {
      // Deselect all
      setSelectedClassSections(prev => 
        prev.filter(id => !classSectionsForClass.some(cs => cs.id === id))
      );
    } else {
      // Select all
      const newIds = classSectionsForClass.map(cs => cs.id);
      setSelectedClassSections(prev => [...new Set([...prev, ...newIds])]);
    }
  };

  // Toggle a single section
  const toggleSection = (csId: number) => {
    setSelectedClassSections(prev => 
      prev.includes(csId) 
        ? prev.filter(id => id !== csId)
        : [...prev, csId]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatClassSections = (subject: Subject): string => {
    if (!subject.class_sections || subject.class_sections.length === 0) {
      return '-';
    }
    
    // Group by class name
    const grouped: { [key: string]: string[] } = {};
    subject.class_sections.forEach(cs => {
      if (!grouped[cs.class_name]) {
        grouped[cs.class_name] = [];
      }
      grouped[cs.class_name].push(cs.section_name);
    });
    
    return Object.entries(grouped)
      .map(([className, sections]) => `${className} ${sections.join(' ')}`)
      .join('\n');
  };

  const filteredSubjects = subjects.filter(
    (s) =>
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedSubjects = filteredSubjects.slice(0, pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">Created Time</div>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
            title="Export to CSV"
          >
            <span>📥</span>
          </button>
          <button
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1 rounded text-sm"
          >
            + Add Subject
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Search:</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            placeholder="Search..."
          />
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4 rounded">
          <p className="text-green-700 text-sm">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sr.No
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject Name <span className="text-gray-400">▲</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Classes & Sections
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedSubjects.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No subjects found. Click "Add Subject" to get started.
                </td>
              </tr>
            ) : (
              paginatedSubjects.map((subject, index) => (
                <tr key={subject.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {subject.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="whitespace-pre-line">
                      {formatClassSections(subject)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(subject.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(subject)}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(subject.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-start justify-center min-h-screen pt-4 px-4 pb-20">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModal(false)}></div>
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-auto mt-10 z-10">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-orange-600 uppercase">
                  {editingSubject ? 'Edit Subject' : 'Add Subject'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <form onSubmit={editingSubject ? handleUpdate : handleCreate}>
                <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                  {/* Subject Name */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Enter subject name"
                    />
                  </div>

                  {/* Subject Code (only for create) */}
                  {!editingSubject && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Code
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        placeholder="Enter subject code"
                      />
                    </div>
                  )}

                  {/* Select Class - Hierarchical Checkboxes */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Select Class
                    </label>
                    <div className="border border-gray-200 rounded p-4 max-h-80 overflow-y-auto">
                      {/* Select All Classes */}
                      {classSections.length > 0 && (
                        <div className="mb-3 pb-2 border-b border-gray-200">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isAllClassesSelected()}
                              ref={(el) => {
                                if (el) el.indeterminate = isAllClassesPartiallySelected();
                              }}
                              onChange={toggleAllClasses}
                              className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm font-semibold text-indigo-700">
                              Select All Classes
                            </span>
                          </label>
                        </div>
                      )}
                      {getGroupedClasses().map((classGroup) => (
                        <div key={classGroup.class_name} className="mb-4">
                          {/* Class Checkbox */}
                          <label className="flex items-center cursor-pointer mb-2">
                            <input
                              type="checkbox"
                              checked={isClassFullySelected(classGroup.class_name)}
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate = isClassPartiallySelected(classGroup.class_name);
                                }
                              }}
                              onChange={() => toggleClass(classGroup.class_name)}
                              className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm font-medium text-gray-700">
                              {classGroup.class_name}
                            </span>
                          </label>
                          
                          {/* Section Checkboxes (indented) */}
                          <div className="ml-6 space-y-1">
                            {classGroup.sections.map((section) => (
                              <label key={section.id} className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClassSections.includes(section.id)}
                                  onChange={() => toggleSection(section.id)}
                                  className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="ml-2 text-sm text-gray-600">
                                  {section.section_name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      {getGroupedClasses().length === 0 && (
                        <p className="text-gray-500 text-sm">No classes available. Please add classes first.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setEditingSubject(null); }}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : (editingSubject ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subjects;
