import React, { useState, useEffect } from 'react';
import { Octokit } from 'octokit';
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
  CodeIcon
} from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  html_url: string;
  private: boolean;
  selected?: boolean;
  deleteStatus?: 'pending' | 'success' | 'error';
  errorMessage?: string;
}

function App() {
  const [token, setToken] = useState('');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

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
      setSuccess(`Successfully loaded ${response.data.length} repositories for ${username}`);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repositories. Please check your token.');
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    const selectedRepos = repositories.filter(repo => repo.selected);
    if (selectedRepos.length === 0) {
      setError('Please select repositories to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedRepos.length} repositories? This action cannot be undone!`)) {
      return;
    }

    setDeleteInProgress(true);
    setError('');
    setSuccess('');

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

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || 'Unknown error occurred';
          setRepositories(repos =>
            repos.map(r =>
              r.id === repo.id ? { ...r, deleteStatus: 'error' as const, errorMessage } : r
            )
          );
          failureCount++;
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

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="relative min-h-screen">
        <div className="py-8 px-4 sm:px-6 lg:px-8 pb-32">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-end mb-4">
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

            <div className="text-center mb-8 animate-fade-in">
              <GithubIcon className="h-20 w-20 mx-auto mb-4 text-gray-800 dark:text-white" />
              <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-violet-500 mb-4">GitHub Repository Manager</h1>
              <p className="text-lg text-gray-600 dark:text-gray-300">Clean up your GitHub repositories with style</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8 transition-all duration-200">
              <div className="mb-6">
                <div className="flex items-start gap-4 mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <KeyIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">How to Generate a Token</h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700 dark:text-blue-200">
                      <li>Go to GitHub.com → Settings → Developer settings</li>
                      <li>Select "Personal access tokens" → "Tokens (classic)"</li>
                      <li>Click "Generate new token" → "Generate new token (classic)"</li>
                      <li>Give it a descriptive name (e.g., "Repository Manager")</li>
                      <li>Under "Select scopes", ensure you check <strong>delete_repo</strong></li>
                      <li>Click "Generate token" and copy it immediately</li>
                    </ol>
                  </div>
                </div>

                <div className="flex gap-4">
                  <input
                    type="password"
                    placeholder="Enter your GitHub token (requires delete_repo scope)"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="flex-1 px-4 py-2 border dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-colors duration-200"
                  />
                  <button
                    onClick={fetchRepositories}
                    disabled={!token || loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors duration-200"
                  >
                    {loading ? <LoaderIcon className="animate-spin h-5 w-5" /> : 'Load Repositories'}
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
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Select All</span>
                  </div>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={deleteInProgress || !repositories.some(r => r.selected)}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors duration-200"
                  >
                    <Trash2Icon className="h-4 w-4" />
                    {deleteInProgress ? 'Deleting...' : 'Delete Selected'}
                  </button>
                </div>

                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {repositories.map((repo) => (
                    <div key={repo.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={repo.selected}
                          onChange={() => toggleRepository(repo.id)}
                          disabled={repo.deleteStatus === 'pending'}
                          className="h-4 w-4 text-blue-600 rounded dark:bg-gray-700"
                        />
                        <div>
                          <div className="flex items-center gap-2">
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
                  ))}
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
      </div>
    </div>
  );
}

export default App;
