import React, { useState, useEffect } from 'react';
import { Octokit } from 'octokit';
import { Toaster, toast } from 'react-hot-toast';
import { Dialog, Transition } from '@headlessui/react';
import clsx from 'clsx';
import { 
  GithubIcon, 
  Trash2Icon, 
  AlertCircleIcon, 
  CheckCircleIcon, 
  LoaderIcon,
  SunIcon,
  MoonIcon,
  KeyIcon,
  HeartIcon,
  CodeIcon,
  SearchIcon,
  FilterIcon,
  XIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  ShieldIcon,
  InfoIcon,
  MinusCircleIcon
} from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  selected?: boolean;
  deleteStatus?: 'pending' | 'success' | 'error';
  errorMessage?: string;
}

function App() {
  const [token, setToken] = useState('');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [filteredRepositories, setFilteredRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [showTokenInfo, setShowTokenInfo] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [filters, setFilters] = useState({
    private: false,
    public: false,
    sortBy: 'updated' as 'updated' | 'created' | 'name' | 'stars' | 'forks',
    language: '' as string
  });
  const [languages, setLanguages] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    filterRepositories();
  }, [repositories, searchTerm, filters]);

  useEffect(() => {
    if (repositories.length > 0) {
      const uniqueLanguages = Array.from(new Set(
        repositories
          .map(repo => repo.language)
          .filter((lang): lang is string => lang !== null)
      )).sort();
      setLanguages(uniqueLanguages);
    }
  }, [repositories]);

  const filterRepositories = () => {
    let filtered = [...repositories];

    if (searchTerm) {
      filtered = filtered.filter(repo => 
        repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (repo.description?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filters.private && !filters.public) {
      filtered = filtered.filter(repo => repo.private);
    } else if (filters.public && !filters.private) {
      filtered = filtered.filter(repo => !repo.private);
    }

    if (filters.language) {
      filtered = filtered.filter(repo => repo.language === filters.language);
    }

    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'stars':
          return b.stargazers_count - a.stargazers_count;
        case 'forks':
          return b.forks_count - a.forks_count;
        default:
          return 0;
      }
    });

    setFilteredRepositories(filtered);
  };

  const verifyTokenPermissions = async (octokit: Octokit) => {
    try {
      const response = await octokit.request('GET /user');
      const scopes = response.headers['x-oauth-scopes'] || '';
      const hasDeleteScope = scopes.split(',').map(s => s.trim()).includes('delete_repo');
      
      if (!hasDeleteScope) {
        throw new Error('Token does not have delete_repo scope. Please generate a new token with the delete_repo permission.');
      }
      
      return response.data.login;
    } catch (err: any) {
      if (err.status === 401) {
        throw new Error('Invalid token. Please check your token and try again.');
      }
      throw new Error(err.message || 'Failed to verify token permissions. Please ensure your token is valid and has the delete_repo scope.');
    }
  };

  const fetchRepositories = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const octokit = new Octokit({ auth: token });
      const username = await verifyTokenPermissions(octokit);
      
      const response = await octokit.request('GET /user/repos', {
        per_page: 100,
        sort: 'updated',
        affiliation: 'owner'
      });
      
      setRepositories(response.data.map(repo => ({
        ...repo,
        selected: false
      })));
      toast.success(`Successfully loaded ${response.data.length} repositories for ${username}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch repositories');
      setError(err.message || 'Failed to fetch repositories. Please check your token.');
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    const selectedRepos = repositories.filter(repo => repo.selected);
    if (selectedRepos.length === 0) {
      toast.error('Please select repositories to delete');
      return;
    }

    setDeleteConfirmationOpen(true);
  };

  const confirmDelete = async () => {
    setDeleteConfirmationOpen(false);
    setDeleteInProgress(true);
    setError('');
    setSuccess('');

    const selectedRepos = repositories.filter(repo => repo.selected);
    const octokit = new Octokit({ auth: token });
    let successCount = 0;
    let failureCount = 0;

    try {
      const username = await verifyTokenPermissions(octokit);

      setRepositories(repos =>
        repos.map(repo =>
          repo.selected ? { ...repo, deleteStatus: 'pending' as const } : repo
        )
      );

      for (const repo of selectedRepos) {
        try {
          await octokit.request('DELETE /repos/{owner}/{repo}', {
            owner: username,
            repo: repo.name
          });

          setRepositories(repos =>
            repos.map(r =>
              r.id === repo.id ? { ...r, deleteStatus: 'success' as const } : r
            )
          );
          successCount++;
          toast.success(`Deleted ${repo.name}`);

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || 'Unknown error occurred';
          setRepositories(repos =>
            repos.map(r =>
              r.id === repo.id ? { ...r, deleteStatus: 'error' as const, errorMessage } : r
            )
          );
          failureCount++;
          toast.error(`Failed to delete ${repo.name}`);
        }
      }

      if (failureCount > 0) {
        setError(`Failed to delete ${failureCount} repositories. ${successCount} repositories were deleted successfully.`);
      } else {
        setSuccess('All selected repositories were deleted successfully!');
        await fetchRepositories();
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setDeleteInProgress(false);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    setRepositories(repos => 
      repos.map(repo => ({ ...repo, selected: checked }))
    );
  };

  const toggleRepository = (id: number) => {
    setRepositories(repos =>
      repos.map(repo =>
        repo.id === id ? { ...repo, selected: !repo.selected } : repo
      )
    );
  };

  const removeFromSelection = (id: number) => {
    setRepositories(repos =>
      repos.map(repo =>
        repo.id === id ? { ...repo, selected: false } : repo
      )
    );
    
    // If no repositories remain selected, close the modal
    const remainingSelected = repositories.filter(repo => repo.id !== id && repo.selected).length;
    if (remainingSelected === 0) {
      setDeleteConfirmationOpen(false);
    }
    
    toast.success('Repository removed from selection');
  };

  const getStatusColor = (status?: 'pending' | 'success' | 'error') => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return '';
    }
  };

  const getLanguageColor = (language: string | null) => {
    const colors: Record<string, string> = {
      JavaScript: 'bg-yellow-400',
      TypeScript: 'bg-blue-400',
      Python: 'bg-green-400',
      Java: 'bg-red-400',
      'C++': 'bg-purple-400',
      Ruby: 'bg-pink-400',
      Go: 'bg-cyan-400',
      Rust: 'bg-orange-400',
    };
    return colors[language || ''] || 'bg-gray-400';
  };

  const selectedRepositories = repositories.filter(repo => repo.selected);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <Toaster position="top-right" />
      <div className="relative min-h-screen">
        <div className="py-8 px-4 sm:px-6 lg:px-8 pb-32">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:hidden">Repo Manager</h1>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
                aria-label="Toggle dark mode"
              >
                {darkMode ? (
                  <SunIcon className="h-6 w-6 text-yellow-400" />
                ) : (
                  <MoonIcon className="h-6 w-6 text-gray-600" />
                )}
              </button>
            </div>

            <div className="text-center mb-8 animate-fade-in hidden md:block">
              <GithubIcon className="h-20 w-20 mx-auto mb-4 text-gray-800 dark:text-white" />
              <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-violet-500 mb-4">
                GitHub Repository Manager
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300">Clean up your GitHub repositories with style</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8 transition-all duration-200">
              <div className="mb-6">
                <div className="flex items-start gap-4 mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <KeyIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-blue-800 dark:text-blue-300">Token Generation</h3>
                      <button
                        onClick={() => setShowTokenInfo(!showTokenInfo)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <InfoIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>Generate a new token</span>
                        <ExternalLinkIcon className="h-4 w-4" />
                      </a>
                      <ShieldIcon className="h-4 w-4 text-green-500" />
                    </div>
                    {showTokenInfo && (
                      <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700 dark:text-blue-200 mt-2">
                        <li>Select "Generate new token" → "Generate new token (classic)"</li>
                        <li>Give it a descriptive name (e.g., "Repository Manager")</li>
                        <li>Under "Select scopes", ensure you check <strong>delete_repo</strong></li>
                        <li>Click "Generate token" and copy it immediately</li>
                      </ol>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <input
                      type="password"
                      placeholder="Enter your GitHub token (requires delete_repo scope)"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full px-4 py-2 border dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-colors duration-200"
                    />
                  </div>
                  <button
                    onClick={fetchRepositories}
                    disabled={!token || loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors duration-200"
                  >
                    {loading ? (
                      <LoaderIcon className="animate-spin h-5 w-5" />
                    ) : (
                      <>
                        <RefreshCwIcon className="h-5 w-5" />
                        Load Repositories
                      </>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 rounded-md flex items-center gap-2 text-red-700 dark:text-red-300 animate-fade-in">
                  <AlertCircleIcon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              {success && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 rounded-md flex items-center gap-2 text-green-700 dark:text-green-300 animate-fade-in">
                  <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1">{success}</span>
                </div>
              )}
            </div>

            {repositories.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg transition-all duration-200 animate-fade-in">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="h-4 w-4 text-blue-600 rounded dark:bg-gray-700"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        Select All ({repositories.filter(r => r.selected).length} selected)
                      </span>
                    </div>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={deleteInProgress || !repositories.some(r => r.selected)}
                      className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors duration-200"
                    >
                      <Trash2Icon className="h-4 w-4" />
                      {deleteInProgress ? 'Deleting...' : 'Delete Selected'}
                    </button>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search repositories..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <button
                      onClick={() => setFilterModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <FilterIcon className="h-5 w-5" />
                      <span>Filters</span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredRepositories.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      No repositories found matching your criteria
                    </div>
                  ) : (
                    filteredRepositories.map((repo) => (
                      <div key={repo.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                        <div className="flex items-start gap-4 mb-4 sm:mb-0">
                          <input
                            type="checkbox"
                            checked={repo.selected}
                            onChange={() => toggleRepository(repo.id)}
                            disabled={repo.deleteStatus === 'pending'}
                            className="h-4 w-4 mt-1 text-blue-600 rounded dark:bg-gray-700"
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={repo.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                              >
                                {repo.name}
                              </a>
                              {repo.private && (
                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                  Private
                                </span>
                              )}
                              {repo.language && (
                                <span className="flex items-center gap-1 text-xs">
                                  <span className={`w-2 h-2 rounded-full ${getLanguageColor(repo.language)}`}></span>
                                  {repo.language}
                                </span>
                              )}
                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-1">
                                  ⭐ {repo.stargazers_count}
                                </span>
                                <span className="flex items-center gap-1">
                                  🍴 {repo.forks_count}
                                </span>
                              </div>
                            </div>
                            {repo.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {repo.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>Created: {new Date(repo.created_at).toLocaleDateString()}</span>
                              <span>Updated: {new Date(repo.updated_at).toLocaleDateString()}</span>
                            </div>
                            {repo.deleteStatus === 'error' && repo.errorMessage && (
                              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{repo.errorMessage}</p>
                            )}
                          </div>
                        </div>
                        <div className={`flex items-center ${getStatusColor(repo.deleteStatus)}`}>
                          {repo.deleteStatus === 'pending' && <LoaderIcon className="h-5 w-5 animate-spin" />}
                          {repo.deleteStatus === 'success' && <CheckCircleIcon className="h-5 w-5" />}
                          {repo.deleteStatus === 'error' && <AlertCircleIcon className="h-5 w-5" />}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="absolute bottom-0 w-full bg-white dark:bg-gray-800 shadow-lg">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <HeartIcon className="h-5 w-5 text-red-500" />
                <span className="text-gray-600 dark:text-gray-300">Made with love by</span>
                <a
                  href="https://github.com/ErolledDev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                >
                  <GithubIcon className="h-4 w-4" />
                  ErolledDev
                </a>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="https://github.com/ErolledDev/Repo-Manager---Delete-Repository-one-click"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
                >
                  <CodeIcon className="h-4 w-4" />
                  Source Code
                </a>
                <span className="text-gray-400">|</span>
                <a
                  href="https://github.com/ErolledDev/Repo-Manager---Delete-Repository-one-click/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  MIT License
                </a>
              </div>
            </div>
          </div>
        </footer>

        {/* Delete Confirmation Modal */}
        <Transition show={deleteConfirmationOpen} as={React.Fragment}>
          <Dialog
            as="div"
            className="fixed inset-0 z-10 overflow-y-auto"
            onClose={() => setDeleteConfirmationOpen(false)}
          >
            <div className="min-h-screen px-4 text-center">
              <Transition.Child
                as={React.Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-30" />
              </Transition.Child>

              <span
                className="inline-block h-screen align-middle"
                aria-hidden="true"
              >
                &#8203;
              </span>

              <Transition.Child
                as={React.Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <div className="inline-block w-full max-w-2xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <Dialog.Title
                        as="h3"
                        className="text-lg font-medium text-red-600 dark:text-red-400"
                      >
                        Confirm Repository Deletion
                      </Dialog.Title>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        You are about to delete the following repositories. This action cannot be undone.
                        Click the remove button (
                        <MinusCircleIcon className="h-4 w-4 inline text-gray-400" />
                        ) to remove a repository from selection.
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmationOpen(false)}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <XIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                      {selectedRepositories.map(repo => (
                        <div key={repo.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg group">
                          <div className="flex items-start justify-between">
                            <div className="flex-grow">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-medium text-gray-900 dark:text-white">{repo.name}</h4>
                                  {repo.description && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                      {repo.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {repo.private && (
                                    <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                                      Private
                                    </span>
                                  )}
                                  <button
                                    onClick={() => removeFromSelection(repo.id)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full"
                                    title="Remove from selection"
                                  >
                                    <MinusCircleIcon className="h-5 w-5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400" />
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                <span>⭐ {repo.stargazers_count} stars</span>
                                <span>🍴 {repo.forks_count} forks</span>
                                {repo.language && (
                                  <span className="flex items-center gap-1">
                                    <span className={`w-2 h-2 rounded-full ${getLanguageColor(repo.language)}`}></span>
                                    {repo.language}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setDeleteConfirmationOpen(false)}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDelete}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 flex items-center gap-2"
                    >
                      <Trash2Icon className="h-4 w-4" />
                      Delete {selectedRepositories.length} {selectedRepositories.length === 1 ? 'Repository' : 'Repositories'}
                    </button>
                  </div>
                </div>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition>

        {/* Filter Modal */}
        <Transition show={filterModalOpen} as={React.Fragment}>
          <Dialog
            as="div"
            className="fixed inset-0 z-10 overflow-y-auto"
            onClose={() => setFilterModalOpen(false)}
          >
            <div className="min-h-screen px-4 text-center">
              <Transition.Child
                as={React.Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-30" />
              </Transition.Child>

              <span
                className="inline-block h-screen align-middle"
                aria-hidden="true"
              >
                &#8203;
              </span>

              <Transition.Child
                as={React.Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium text-gray-900 dark:text-white"
                    >
                      Filter Repositories
                    </Dialog.Title>
                    <button
                      onClick={() => setFilterModalOpen(false)}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <XIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Visibility
                      </h4>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.private}
                            onChange={(e) =>
                              setFilters({ ...filters, private: e.target.checked })
                            }
                            className="h-4 w-4 text-blue-600 rounded dark:bg-gray-700"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">
                            Private repositories
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.public}
                            onChange={(e) =>
                              setFilters({ ...filters, public: e.target.checked })
                            }
                            className="h-4 w-4 text-blue-600 rounded dark:bg-gray-700"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">
                            Public repositories
                          </span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Language
                      </h4>
                      <select
                        value={filters.language}
                        onChange={(e) =>
                          setFilters({ ...filters, language: e.target.value })
                        }
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">All Languages</option>
                        {languages.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Sort by
                      </h4>
                      <select
                        value={filters.sortBy}
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            sortBy: e.target.value as typeof filters.sortBy,
                          })
                        }
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      >
                        <option value="updated">Last updated</option>
                        <option value="created">Creation date</option>
                        <option value="name">Repository name</option>
                        <option value="stars">Stars count</option>
                        <option value="forks">Forks count</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setFilterModalOpen(false)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition>
      </div>
    </div>
  );
}

export default App;